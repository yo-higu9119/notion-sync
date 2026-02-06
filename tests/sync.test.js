import { jest } from '@jest/globals';
import { getTargetDatabases, mapProperties, getPageTitle } from '../src/utils.js';

describe('getTargetDatabases', () => {
  test('動画制作レベル1は3つのDBに配置', () => {
    const targets = getTargetDatabases('動画制作', 'レベル1');
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(['video_level1', 'video_level2', 'video_level3']);
  });

  test('動画制作レベル2は2つのDBに配置', () => {
    const targets = getTargetDatabases('動画制作', 'レベル2');
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(['video_level2', 'video_level3']);
  });

  test('動画制作レベル3は1つのDBに配置', () => {
    const targets = getTargetDatabases('動画制作', 'レベル3');
    expect(targets).toHaveLength(1);
    expect(targets).toEqual(['video_level3']);
  });

  test('デザイン制作レベル1は3つのDBに配置', () => {
    const targets = getTargetDatabases('デザイン制作', 'レベル1');
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(['design_level1', 'design_level2', 'design_level3']);
  });

  test('デザイン制作レベル2は2つのDBに配置', () => {
    const targets = getTargetDatabases('デザイン制作', 'レベル2');
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(['design_level2', 'design_level3']);
  });

  test('デザイン制作レベル3は1つのDBに配置', () => {
    const targets = getTargetDatabases('デザイン制作', 'レベル3');
    expect(targets).toHaveLength(1);
    expect(targets).toEqual(['design_level3']);
  });

  test('対象外の案件タイプは空配列', () => {
    const targets = getTargetDatabases('プログラミング', 'レベル1');
    expect(targets).toHaveLength(0);
  });

  test('不正なレベルは空配列', () => {
    const targets = getTargetDatabases('動画制作', 'レベル4');
    expect(targets).toHaveLength(0);
  });
});

describe('mapProperties', () => {
  function mockNotionPage() {
    return {
      id: 'test-page-id',
      properties: {
        '案件名': {
          type: 'title',
          title: [{ type: 'text', plain_text: 'テスト案件', text: { content: 'テスト案件' } }],
        },
        '案件ID': {
          type: 'unique_id',
          unique_id: { number: 1001, prefix: 'JOB' },
        },
        'カテゴリ': {
          type: 'select',
          select: { name: 'YouTube動画編集' },
        },
        'タグ': {
          type: 'multi_select',
          multi_select: [{ name: 'YouTube' }, { name: '横型' }],
        },
        '案件概要': {
          type: 'rich_text',
          rich_text: [{ type: 'text', plain_text: '概要テキスト', text: { content: '概要テキスト' } }],
        },
        '報酬金額': {
          type: 'number',
          number: 50000,
        },
        '応募フォーム': {
          type: 'url',
          url: 'https://example.com/form',
        },
        '仕事の特徴': {
          type: 'multi_select',
          multi_select: [{ name: '未経験歓迎' }],
        },
        '経験レベル': {
          type: 'select',
          select: { name: '未経験OK' },
        },
        '必須スキル': {
          type: 'multi_select',
          multi_select: [{ name: 'Premiere Pro' }],
        },
        '推奨スキル': {
          type: 'multi_select',
          multi_select: [],
        },
        '納期目安': {
          type: 'date',
          date: { start: '2026-03-01', end: null },
        },
        '想定工数': {
          type: 'rich_text',
          rich_text: [{ type: 'text', plain_text: '10時間', text: { content: '10時間' } }],
        },
        '単発/継続': {
          type: 'select',
          select: { name: '単発' },
        },
        '報酬形態': {
          type: 'select',
          select: { name: '固定報酬' },
        },
        '報酬詳細': {
          type: 'rich_text',
          rich_text: [],
        },
        '募集人数': {
          type: 'number',
          number: 3,
        },
        '契約形態': {
          type: 'multi_select',
          multi_select: [{ name: '業務委託' }],
        },
      },
    };
  }

  const copyFields = [
    '案件名', 'カテゴリ', 'タグ', '案件概要', '仕事の特徴',
    '経験レベル', '必須スキル', '推奨スキル', '納期目安', '想定工数',
    '単発/継続', '報酬形態', '報酬金額', '報酬詳細', '募集人数',
    '契約形態', '応募フォーム', '案件詳細',
  ];

  test('必須プロパティが正しくマッピングされる', () => {
    const page = mockNotionPage();
    const mapped = mapProperties(page, copyFields);
    expect(mapped).toHaveProperty('案件名');
    expect(mapped).toHaveProperty('マスター案件ID');
    expect(mapped['マスター案件ID']).toEqual({ number: 1001 });
  });

  test('タイトルが正しくマッピングされる', () => {
    const page = mockNotionPage();
    const mapped = mapProperties(page, copyFields);
    expect(mapped['案件名'].title).toHaveLength(1);
    expect(mapped['案件名'].title[0].plain_text).toBe('テスト案件');
  });

  test('Selectプロパティが正しくマッピングされる', () => {
    const page = mockNotionPage();
    const mapped = mapProperties(page, copyFields);
    expect(mapped['カテゴリ']).toEqual({ select: { name: 'YouTube動画編集' } });
  });

  test('Multi-selectプロパティが正しくマッピングされる', () => {
    const page = mockNotionPage();
    const mapped = mapProperties(page, copyFields);
    expect(mapped['タグ']).toEqual({
      multi_select: [{ name: 'YouTube' }, { name: '横型' }],
    });
  });

  test('Numberプロパティが正しくマッピングされる', () => {
    const page = mockNotionPage();
    const mapped = mapProperties(page, copyFields);
    expect(mapped['報酬金額']).toEqual({ number: 50000 });
  });

  test('URLプロパティが正しくマッピングされる', () => {
    const page = mockNotionPage();
    const mapped = mapProperties(page, copyFields);
    expect(mapped['応募フォーム']).toEqual({ url: 'https://example.com/form' });
  });

  test('除外プロパティが含まれていない', () => {
    const page = mockNotionPage();
    const mapped = mapProperties(page, copyFields);
    expect(mapped).not.toHaveProperty('案件ID');
    expect(mapped).not.toHaveProperty('ステータス');
  });
});

describe('getPageTitle', () => {
  test('タイトルを正しく取得できる', () => {
    const page = {
      properties: {
        '案件名': {
          type: 'title',
          title: [{ plain_text: 'テスト案件名' }],
        },
      },
    };
    expect(getPageTitle(page)).toBe('テスト案件名');
  });

  test('タイトルが空の場合は(無題)を返す', () => {
    const page = {
      properties: {
        '案件名': {
          type: 'title',
          title: [],
        },
      },
    };
    expect(getPageTitle(page)).toBe('(無題)');
  });

  test('タイトルプロパティがない場合は(無題)を返す', () => {
    const page = { properties: {} };
    expect(getPageTitle(page)).toBe('(無題)');
  });
});
