/**
 * 案件コピー処理（マスターDB → 公開DB）
 *
 * 処理フロー:
 * 1. マスターDBから「募集中」案件を取得
 * 2. 案件タイプ × レベルで配置先DBを決定
 * 3. 各DBで既存チェック（マスター案件IDで検索）
 * 4. 存在しない場合のみ作成
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  initClient,
  queryDatabase,
  createPage,
  getPageBlocks,
} from './notion-client.js';
import {
  log,
  getTargetDatabases,
  mapProperties,
  getPageTitle,
  loadDbConfig,
} from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 設定読み込み
const propMapping = JSON.parse(readFileSync(join(__dirname, '../config/property-mapping.json'), 'utf-8'));

/**
 * メイン処理
 */
async function main() {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    log('ERROR', '環境変数 NOTION_API_KEY が設定されていません');
    process.exit(1);
  }

  initClient(apiKey);

  const dbConfig = loadDbConfig();
  log('INFO', '🔄 同期処理を開始します...');

  try {
    // 1. マスターDBから「募集中」案件を取得
    const activeJobs = await queryDatabase(dbConfig.master, {
      property: 'ステータス',
      status: { equals: '募集中' },
    });

    log('INFO', `✅ ${activeJobs.length}件の募集中案件を取得しました`);

    if (activeJobs.length === 0) {
      log('INFO', '📭 新しい案件はありません');
      return;
    }

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 2. 各案件を処理
    for (const job of activeJobs) {
      const jobName = getPageTitle(job);
      const jobType = job.properties['案件タイプ']?.select?.name;
      const level = job.properties['レベル']?.select?.name;
      const masterId = job.properties['案件ID']?.unique_id?.number;

      // データ検証
      if (!jobType || !level || masterId == null) {
        log('WARN', `⚠️ データ不整合: 案件「${jobName}」をスキップ (タイプ=${jobType}, レベル=${level}, ID=${masterId})`);
        errorCount++;
        continue;
      }

      // 配置先DBを決定
      const targetDbKeys = getTargetDatabases(jobType, level);
      if (targetDbKeys.length === 0) {
        log('WARN', `⚠️ 対象外の案件タイプ: 「${jobName}」(${jobType})`);
        skippedCount++;
        continue;
      }

      log('INFO', `📍 ${jobName} → ${targetDbKeys.length}個のDBに配置`);

      // デバッグ: マスターDBのプロパティ名一覧を出力
      const sourceKeys = Object.keys(job.properties);
      log('INFO', `  🔑 マスターDBプロパティ: ${sourceKeys.join(', ')}`);

      // プロパティマッピング
      const properties = mapProperties(job, propMapping.copy);

      // デバッグ: マッピング結果のプロパティ名を出力
      log('INFO', `  📋 マッピング済み: ${Object.keys(properties).join(', ')}`);

      // ページ内コンテンツ（案件詳細）を取得
      let children = [];
      try {
        const blocks = await getPageBlocks(job.id);
        children = blocks
          .filter((b) => b.type !== 'child_database' && b.type !== 'child_page')
          .map(sanitizeBlock);
      } catch (err) {
        log('WARN', `  ⚠️ ページコンテンツの取得に失敗: ${err.message}`);
      }

      // 3. 各DBに配置
      for (const dbKey of targetDbKeys) {
        const targetDbId = dbConfig.public[dbKey];
        if (!targetDbId) {
          log('ERROR', `  ❌ データベースID未設定: ${dbKey}`);
          errorCount++;
          continue;
        }

        try {
          // 既存チェック
          const existing = await queryDatabase(targetDbId, {
            property: 'マスター案件ID',
            number: { equals: masterId },
          });

          if (existing.length > 0) {
            log('INFO', `  ⏭️ スキップ(${dbKey}): 既に存在`);
            skippedCount++;
            continue;
          }

          // 作成
          const created = await createPage(targetDbId, properties, children);
          log('INFO', `  ✅ 作成完了(${dbKey}): ${created.id.substring(0, 8)}...`);
          createdCount++;
        } catch (err) {
          log('ERROR', `  ❌ エラー(${dbKey}): ${err.message}`);
          errorCount++;
        }
      }
    }

    log('INFO', '---');
    log('INFO', `🎉 同期処理が完了しました (作成: ${createdCount}, スキップ: ${skippedCount}, エラー: ${errorCount})`);
  } catch (err) {
    log('ERROR', `❌ 同期処理でエラーが発生しました: ${err.message}`);
    process.exit(1);
  }
}

/**
 * ブロックオブジェクトから書き込み用のプロパティのみ抽出する
 * Notion APIで取得したブロックには読み取り専用のプロパティが含まれるため、
 * 作成時に不要なプロパティを除去する。
 * @param {object} block ブロックオブジェクト
 * @returns {object} サニタイズされたブロック
 */
function sanitizeBlock(block) {
  const { type } = block;
  const content = block[type];
  if (!content) return { type, [type]: {} };

  const sanitized = { ...content };
  // 読み取り専用プロパティを除去
  delete sanitized.id;
  delete sanitized.created_time;
  delete sanitized.last_edited_time;
  delete sanitized.created_by;
  delete sanitized.last_edited_by;
  delete sanitized.has_children;
  delete sanitized.parent;
  delete sanitized.archived;

  return { type, [type]: sanitized };
}

main();
