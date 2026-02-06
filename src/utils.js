/**
 * ユーティリティ関数
 */

/**
 * 指定ミリ秒だけ待機する
 * @param {number} ms ミリ秒
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 現在時刻をフォーマットして返す
 * @returns {string} YYYY-MM-DD HH:mm:ss 形式の文字列
 */
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * ログ出力関数
 * @param {'INFO'|'WARN'|'ERROR'} level ログレベル
 * @param {string} message メッセージ
 */
export function log(level, message) {
  const timestamp = getTimestamp();
  const line = `[${timestamp}] ${level}: ${message}`;
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
}

/**
 * 案件タイプとレベルから配置先のデータベースキーを決定する
 *
 * レベル別配信ルール:
 *   レベル1案件 → レベル1,2,3のDBに配置
 *   レベル2案件 → レベル2,3のDBに配置
 *   レベル3案件 → レベル3のDBのみに配置
 *
 * @param {string} jobType 案件タイプ（動画制作/デザイン制作）
 * @param {string} level レベル（レベル1/レベル2/レベル3）
 * @returns {string[]} 配置先データベースのキー配列
 */
export function getTargetDatabases(jobType, level) {
  const typePrefix = getTypePrefix(jobType);
  if (!typePrefix) return [];

  switch (level) {
    case 'レベル1':
      return [
        `${typePrefix}_level1`,
        `${typePrefix}_level2`,
        `${typePrefix}_level3`,
      ];
    case 'レベル2':
      return [
        `${typePrefix}_level2`,
        `${typePrefix}_level3`,
      ];
    case 'レベル3':
      return [
        `${typePrefix}_level3`,
      ];
    default:
      return [];
  }
}

/**
 * 案件タイプからDBキーのプレフィックスを取得する
 * @param {string} jobType 案件タイプ
 * @returns {string|null} プレフィックス
 */
function getTypePrefix(jobType) {
  const mapping = {
    '動画制作': 'video',
    'デザイン制作': 'design',
  };
  return mapping[jobType] || null;
}

/**
 * マスターDBのページプロパティから公開DB用のプロパティオブジェクトを構築する
 * @param {object} page Notion APIから取得したページオブジェクト
 * @param {string[]} copyFields コピー対象のプロパティ名配列
 * @returns {object} 公開DB用のプロパティオブジェクト
 */
export function mapProperties(page, copyFields) {
  const sourceProps = page.properties;
  const mapped = {};

  for (const field of copyFields) {
    if (field === '案件詳細') continue; // ページ内テキストは別処理
    if (field === '案件名') continue; // Titleは別途処理

    const prop = sourceProps[field];
    if (!prop) continue;

    mapped[field] = buildPropertyValue(prop);
  }

  // タイトルプロパティ
  const titleProp = sourceProps['案件名'];
  if (titleProp) {
    mapped['案件名'] = {
      title: titleProp.title || [],
    };
  }

  // マスター案件IDを追加
  const masterIdProp = sourceProps['案件ID'];
  if (masterIdProp && masterIdProp.unique_id) {
    mapped['マスター案件ID'] = {
      number: masterIdProp.unique_id.number,
    };
  }

  return mapped;
}

/**
 * Notionプロパティの値オブジェクトを構築する
 * @param {object} prop Notionプロパティオブジェクト
 * @returns {object} 書き込み用プロパティ値
 */
function buildPropertyValue(prop) {
  switch (prop.type) {
    case 'rich_text':
      return { rich_text: prop.rich_text || [] };
    case 'number':
      return { number: prop.number };
    case 'select':
      return prop.select ? { select: { name: prop.select.name } } : { select: null };
    case 'multi_select':
      return {
        multi_select: (prop.multi_select || []).map((item) => ({ name: item.name })),
      };
    case 'date':
      return { date: prop.date };
    case 'url':
      return { url: prop.url };
    case 'checkbox':
      return { checkbox: prop.checkbox };
    case 'email':
      return { email: prop.email };
    case 'phone_number':
      return { phone_number: prop.phone_number };
    default:
      return { rich_text: prop.rich_text || [] };
  }
}

/**
 * ページのタイトルをテキストとして取得する
 * @param {object} page Notionページオブジェクト
 * @returns {string} タイトル文字列
 */
export function getPageTitle(page) {
  const titleProp = page.properties['案件名'];
  if (!titleProp || !titleProp.title) return '(無題)';
  return titleProp.title.map((t) => t.plain_text).join('') || '(無題)';
}

/**
 * 環境変数からデータベース設定を読み込む
 * @returns {{ master: string, public: Record<string, string> }}
 */
export function loadDbConfig() {
  const required = {
    master: 'NOTION_MASTER_DB_ID',
    video_level1: 'NOTION_VIDEO_LEVEL1_DB_ID',
    video_level2: 'NOTION_VIDEO_LEVEL2_DB_ID',
    video_level3: 'NOTION_VIDEO_LEVEL3_DB_ID',
    design_level1: 'NOTION_DESIGN_LEVEL1_DB_ID',
    design_level2: 'NOTION_DESIGN_LEVEL2_DB_ID',
    design_level3: 'NOTION_DESIGN_LEVEL3_DB_ID',
  };

  const missing = Object.entries(required)
    .filter(([, envKey]) => !process.env[envKey])
    .map(([, envKey]) => envKey);

  if (missing.length > 0) {
    throw new Error(`必須環境変数が未設定です: ${missing.join(', ')}`);
  }

  return {
    master: process.env[required.master],
    public: {
      video_level1: process.env[required.video_level1],
      video_level2: process.env[required.video_level2],
      video_level3: process.env[required.video_level3],
      design_level1: process.env[required.design_level1],
      design_level2: process.env[required.design_level2],
      design_level3: process.env[required.design_level3],
    },
  };
}
