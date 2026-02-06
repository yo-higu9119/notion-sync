/**
 * Notion APIクライアント（レート制限・リトライ付き）
 */

import { Client } from '@notionhq/client';
import { sleep, log } from './utils.js';

const MAX_RETRIES = 3;
const API_INTERVAL_MS = 350; // 3 req/sec を超えないように

let notion;

/**
 * Notion クライアントを初期化する
 * @param {string} apiKey Notion API Key
 * @returns {Client} Notionクライアントインスタンス
 */
export function initClient(apiKey) {
  notion = new Client({ auth: apiKey });
  return notion;
}

/**
 * APIリクエストをリトライ付きで実行する
 * @param {Function} fn 実行する関数
 * @returns {Promise<any>} レスポンス
 */
async function withRetry(fn) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      await sleep(API_INTERVAL_MS);
      return result;
    } catch (error) {
      if (error.code === 'rate_limited') {
        const retryAfter = (error.headers?.['retry-after'] || 60) * 1000;
        log('WARN', `レート制限: ${retryAfter / 1000}秒待機 (試行 ${attempt}/${MAX_RETRIES})`);
        await sleep(retryAfter);
        continue;
      }
      if (attempt < MAX_RETRIES && isRetryable(error)) {
        const backoff = Math.pow(2, attempt) * 1000;
        log('WARN', `リトライ ${attempt}/${MAX_RETRIES}: ${backoff / 1000}秒後に再試行`);
        await sleep(backoff);
        continue;
      }
      throw error;
    }
  }
}

/**
 * リトライ可能なエラーかどうかを判定する
 * @param {Error} error エラーオブジェクト
 * @returns {boolean}
 */
function isRetryable(error) {
  const retryableCodes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'rate_limited'];
  if (retryableCodes.includes(error.code)) return true;
  if (error.status >= 500) return true;
  return false;
}

/**
 * データベースをクエリする
 * @param {string} databaseId データベースID
 * @param {object} filter フィルター条件
 * @returns {Promise<object[]>} ページ配列
 */
export async function queryDatabase(databaseId, filter) {
  const pages = [];
  let cursor;

  do {
    const response = await withRetry(() =>
      notion.databases.query({
        database_id: databaseId,
        filter,
        start_cursor: cursor,
      })
    );
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

/**
 * ページを作成する
 * @param {string} databaseId 作成先データベースID
 * @param {object} properties プロパティオブジェクト
 * @param {object[]} [children] ページ内コンテンツ（ブロック配列）
 * @returns {Promise<object>} 作成されたページ
 */
export async function createPage(databaseId, properties, children) {
  const params = {
    parent: { database_id: databaseId },
    properties,
  };
  if (children && children.length > 0) {
    params.children = children;
  }
  return withRetry(() => notion.pages.create(params));
}

/**
 * ページをアーカイブする
 * @param {string} pageId ページID
 * @returns {Promise<object>} 更新されたページ
 */
export async function archivePage(pageId) {
  return withRetry(() =>
    notion.pages.update({
      page_id: pageId,
      archived: true,
    })
  );
}

/**
 * ページのブロック（子要素）を取得する
 * @param {string} pageId ページID
 * @returns {Promise<object[]>} ブロック配列
 */
export async function getPageBlocks(pageId) {
  const blocks = [];
  let cursor;

  do {
    const response = await withRetry(() =>
      notion.blocks.children.list({
        block_id: pageId,
        start_cursor: cursor,
      })
    );
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return blocks;
}
