import { jest } from '@jest/globals';

// notion-client のモック
const mockQueryDatabase = jest.fn();
const mockArchivePage = jest.fn();
const mockInitClient = jest.fn();

jest.unstable_mockModule('../src/notion-client.js', () => ({
  initClient: mockInitClient,
  queryDatabase: mockQueryDatabase,
  archivePage: mockArchivePage,
}));

describe('cleanup - findPublicJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('マスター案件IDで公開DBから案件を検索できる', async () => {
    const mockPages = [
      { id: 'page-1', properties: {} },
      { id: 'page-2', properties: {} },
    ];
    mockQueryDatabase.mockResolvedValue(mockPages);

    const { queryDatabase } = await import('../src/notion-client.js');
    const results = await queryDatabase('test-db-id', {
      property: 'マスター案件ID',
      number: { equals: 1001 },
    });

    expect(results).toBeInstanceOf(Array);
    expect(results).toHaveLength(2);
    expect(mockQueryDatabase).toHaveBeenCalledWith('test-db-id', {
      property: 'マスター案件ID',
      number: { equals: 1001 },
    });
  });

  test('該当案件がない場合は空配列を返す', async () => {
    mockQueryDatabase.mockResolvedValue([]);

    const { queryDatabase } = await import('../src/notion-client.js');
    const results = await queryDatabase('test-db-id', {
      property: 'マスター案件ID',
      number: { equals: 9999 },
    });

    expect(results).toBeInstanceOf(Array);
    expect(results).toHaveLength(0);
  });

  test('ページをアーカイブできる', async () => {
    mockArchivePage.mockResolvedValue({ id: 'page-1', archived: true });

    const { archivePage } = await import('../src/notion-client.js');
    const result = await archivePage('page-1');

    expect(result.archived).toBe(true);
    expect(mockArchivePage).toHaveBeenCalledWith('page-1');
  });
});
