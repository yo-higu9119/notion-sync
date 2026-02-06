/**
 * 案件削除処理（公開DBからアーカイブ）
 *
 * 処理フロー:
 * 1. マスターDBから「募集終了」案件を取得
 * 2. 各案件のマスター案件IDを取得
 * 3. 全6つの公開DBで該当案件を検索
 * 4. 見つかった案件をアーカイブ（削除）
 */

import {
  initClient,
  queryDatabase,
  archivePage,
} from './notion-client.js';
import { log, getPageTitle, loadDbConfig } from './utils.js';

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
  log('INFO', '🧹 削除処理を開始します...');

  try {
    // 1. マスターDBから「募集終了」案件を取得
    const closedJobs = await queryDatabase(dbConfig.master, {
      property: 'ステータス',
      status: { equals: '募集終了' },
    });

    log('INFO', `✅ ${closedJobs.length}件の募集終了案件を取得しました`);

    if (closedJobs.length === 0) {
      log('INFO', '📭 削除対象の案件はありません');
      return;
    }

    let archivedCount = 0;
    let errorCount = 0;

    // 公開DB一覧
    const publicDbEntries = Object.entries(dbConfig.public);

    // 2. 各案件を処理
    for (const job of closedJobs) {
      const jobName = getPageTitle(job);
      const masterId = job.properties['案件ID']?.unique_id?.number;

      if (masterId == null) {
        log('WARN', `⚠️ マスター案件IDが取得できません: 「${jobName}」`);
        errorCount++;
        continue;
      }

      log('INFO', `🔍 ${jobName} (ID: ${masterId}) を公開DBから検索`);

      // 3. 全公開DBで検索してアーカイブ
      for (const [dbKey, dbId] of publicDbEntries) {
        if (!dbId) continue;

        try {
          const found = await queryDatabase(dbId, {
            property: 'マスター案件ID',
            number: { equals: masterId },
          });

          for (const page of found) {
            await archivePage(page.id);
            log('INFO', `  🗑️ アーカイブ完了(${dbKey}): ${page.id.substring(0, 8)}...`);
            archivedCount++;
          }
        } catch (err) {
          log('ERROR', `  ❌ エラー(${dbKey}): ${err.message}`);
          errorCount++;
        }
      }
    }

    log('INFO', '---');
    log('INFO', `🎉 削除処理が完了しました (アーカイブ: ${archivedCount}, エラー: ${errorCount})`);
  } catch (err) {
    log('ERROR', `❌ 削除処理でエラーが発生しました: ${err.message}`);
    process.exit(1);
  }
}

main();
