/**
 * 案件削除処理（公開DBからアーカイブ）
 *
 * 処理フロー:
 * 1. 全公開DBから掲載中の案件（マスター案件ID）を収集
 * 2. マスターDBでステータスを確認
 * 3. ステータスが「募集中」以外（または存在しない）案件をアーカイブ
 */

import {
  initClient,
  queryDatabase,
  archivePage,
} from './notion-client.js';
import { log, loadDbConfig } from './utils.js';

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
    // 1. 全公開DBから掲載中の案件を収集
    //    publicPagesMap: masterId → [{ dbKey, pageId }]
    const publicDbEntries = Object.entries(dbConfig.public);
    const publicPagesMap = new Map();

    for (const [dbKey, dbId] of publicDbEntries) {
      if (!dbId) continue;

      const pages = await queryDatabase(dbId);
      for (const page of pages) {
        const masterId = page.properties['マスター案件ID']?.number;
        if (masterId == null) continue;

        if (!publicPagesMap.has(masterId)) {
          publicPagesMap.set(masterId, []);
        }
        publicPagesMap.get(masterId).push({ dbKey, pageId: page.id });
      }
    }

    log('INFO', `✅ 公開DB合計 ${publicPagesMap.size} 件の掲載案件を確認`);

    if (publicPagesMap.size === 0) {
      log('INFO', '📭 掲載中の案件はありません');
      return;
    }

    let archivedCount = 0;
    let errorCount = 0;

    // 2. マスターDBのステータスを確認し、「募集中」以外をアーカイブ
    for (const [masterId, entries] of publicPagesMap) {
      try {
        const masterResults = await queryDatabase(dbConfig.master, {
          property: '案件ID',
          unique_id: { equals: masterId },
        });

        const masterJob = masterResults[0];
        const status = masterJob?.properties['ステータス']?.status?.name;

        if (status === '募集中') {
          continue;
        }

        const reason = masterJob ? `ステータス=${status}` : 'マスターDBに存在しない';
        log('INFO', `🔍 アーカイブ対象 (ID: ${masterId}, ${reason})`);

        for (const { dbKey, pageId } of entries) {
          try {
            await archivePage(pageId);
            log('INFO', `  🗑️ アーカイブ完了(${dbKey}): ${pageId.substring(0, 8)}...`);
            archivedCount++;
          } catch (err) {
            log('ERROR', `  ❌ エラー(${dbKey}): ${err.message}`);
            errorCount++;
          }
        }
      } catch (err) {
        log('ERROR', `  ❌ マスターDB確認エラー(ID: ${masterId}): ${err.message}`);
        errorCount++;
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
