import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('langchain', () => ({
  tool: (impl: unknown, config: Record<string, unknown>) => ({
    ...config,
    invoke: impl,
  }),
}));

const registerEmbeddingFunctionMock = vi.fn();
const chromaClientCtor = vi.fn();
const openAIEmbeddingFunctionMock = vi.fn();

vi.mock('chromadb', () => ({
  ChromaClient: chromaClientCtor,
  registerEmbeddingFunction: registerEmbeddingFunctionMock,
}));

vi.mock('@chroma-core/openai', () => ({
  OpenAIEmbeddingFunction: openAIEmbeddingFunctionMock,
}));

type RetrievalResult = {
  collection: string;
  id: string;
  distance: number | null;
  text: string;
  metadata: Record<string, unknown> | null;
};

type RetrieveTool = {
  invoke: (input: { query: string; k: number }) => Promise<{
    query: string;
    results: RetrievalResult[];
  }>;
};

type LoadedTools = {
  retrieveAeronautical: RetrieveTool;
  retrievePoh: RetrieveTool;
};

async function loadTools(): Promise<LoadedTools> {
  return (await import('./retrieve.js')) as LoadedTools;
}

const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  chromaClientCtor.mockReset();
  registerEmbeddingFunctionMock.mockClear();
  openAIEmbeddingFunctionMock.mockReset();
  process.env.OPENAI_API_KEY = 'test-openai-key';
});

afterEach(() => {
  process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
});

describe('retrieveAeronautical tool', () => {
  it('retrieves results and queries only the phak collection', async () => {
    const listCollectionsMock = vi
      .fn()
      .mockResolvedValue([{ name: 'phak' }, { name: 'c172' }]);

    const rows = [
      {
        id: 'doc-1',
        distance: 0.6,
        document: 'PHAK content one',
        metadata: { page: 1 },
      },
      {
        id: 'doc-2',
        distance: 0.2,
        document: 'PHAK content two',
        metadata: null,
      },
      {
        id: 'doc-3',
        distance: 0.9,
        document: 'PHAK content three',
        metadata: { page: 3 },
      },
    ];

    const collectionQuery = vi.fn(async () => ({
      rows: () => [rows],
    }));

    const requestedCollections: string[] = [];

    const getCollectionMock = vi.fn().mockImplementation(async ({ name }) => {
      requestedCollections.push(name as string);
      return { query: collectionQuery };
    });

    chromaClientCtor.mockImplementation(() => ({
      listCollections: listCollectionsMock,
      getCollection: getCollectionMock,
    }));

    openAIEmbeddingFunctionMock.mockImplementation((config: unknown) => ({
      __type: 'embedding',
      config,
    }));

    const { retrieveAeronautical } = await loadTools();

    const result = await retrieveAeronautical.invoke({
      query: '  general aviation basics ',
      k: 2,
    });

    expect(result.query).toBe('general aviation basics');
    expect(result.results).toHaveLength(2);
    expect(result.results.map((item) => item.id)).toEqual(['doc-2', 'doc-1']);
    expect(requestedCollections).toEqual(['phak']);

    expect(openAIEmbeddingFunctionMock).toHaveBeenCalledWith({
      apiKey: 'test-openai-key',
      modelName: 'text-embedding-3-small',
    });

    expect(collectionQuery).toHaveBeenCalledWith({
      queryTexts: ['general aviation basics'],
      nResults: 2,
      include: ['documents', 'metadatas', 'distances'],
    });

    expect(chromaClientCtor).toHaveBeenCalledWith({
      host: 'localhost',
      port: 8000,
      ssl: false,
    });
  });

  it('throws when the query is empty after trimming', async () => {
    const { retrieveAeronautical } = await loadTools();

    await expect(
      retrieveAeronautical.invoke({ query: '   ', k: 1 }),
    ).rejects.toThrow('Query must not be empty.');
  });

  it('throws when OPENAI_API_KEY is missing', async () => {
    process.env.OPENAI_API_KEY = '';

    const { retrieveAeronautical } = await loadTools();

    await expect(
      retrieveAeronautical.invoke({ query: 'test', k: 1 }),
    ).rejects.toThrow(
      'OPENAI_API_KEY environment variable is required for retrieval.',
    );
  });

  it('throws when k is not provided as a number', async () => {
    const { retrieveAeronautical } = await loadTools();

    await expect(
      retrieveAeronautical.invoke({ query: 'valid', k: Number.NaN }),
    ).rejects.toThrow('`k` must be provided as a number.');
  });

  it('propagates connection failures when listing collections', async () => {
    const listCollectionsMock = vi
      .fn()
      .mockRejectedValue(new Error('connection refused'));
    const getCollectionMock = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    chromaClientCtor.mockImplementation(() => ({
      listCollections: listCollectionsMock,
      getCollection: getCollectionMock,
    }));

    const { retrieveAeronautical } = await loadTools();

    await expect(
      retrieveAeronautical.invoke({ query: 'docs', k: 1 }),
    ).rejects.toThrow('Unable to connect to ChromaDB. See server logs.');

    expect(consoleError).toHaveBeenCalledWith(
      '[retrieve-aeronautical] Failed to list Chroma collections',
      'connection refused',
    );

    consoleError.mockRestore();
  });

  it('returns an empty result set when the phak collection is absent', async () => {
    const listCollectionsMock = vi
      .fn()
      .mockResolvedValue([{ name: 'c172' }, { name: 'bonanza' }]);
    const getCollectionMock = vi.fn();

    chromaClientCtor.mockImplementation(() => ({
      listCollections: listCollectionsMock,
      getCollection: getCollectionMock,
    }));

    const { retrieveAeronautical } = await loadTools();

    const result = await retrieveAeronautical.invoke({
      query: 'anything',
      k: 5,
    });

    expect(result.results).toEqual([]);
    expect(getCollectionMock).not.toHaveBeenCalled();
  });
});

describe('retrievePoh tool', () => {
  it('retrieves results and excludes the phak collection', async () => {
    const listCollectionsMock = vi
      .fn()
      .mockResolvedValue([
        { name: 'phak' },
        { name: 'c172' },
        { name: 'sr22' },
      ]);

    const c172Rows = [
      {
        id: 'c172-1',
        distance: 0.4,
        document: 'C172 emergency procedures',
        metadata: { page: 3 },
      },
    ];

    const sr22Rows = [
      {
        id: 'sr22-1',
        distance: 0.1,
        document: 'SR22 normal procedures',
        metadata: { page: 10 },
      },
    ];

    const c172Query = vi.fn(async () => ({
      rows: () => [c172Rows],
    }));

    const sr22Query = vi.fn(async () => ({
      rows: () => [sr22Rows],
    }));

    const requestedCollections: string[] = [];

    const getCollectionMock = vi.fn().mockImplementation(async ({ name }) => {
      requestedCollections.push(name as string);
      if (name === 'c172') {
        return { query: c172Query };
      }
      return { query: sr22Query };
    });

    chromaClientCtor.mockImplementation(() => ({
      listCollections: listCollectionsMock,
      getCollection: getCollectionMock,
    }));

    openAIEmbeddingFunctionMock.mockImplementation((config: unknown) => ({
      __type: 'embedding',
      config,
    }));

    const { retrievePoh } = await loadTools();

    const result = await retrievePoh.invoke({
      query: ' checklist ',
      k: 5,
    });

    expect(result.query).toBe('checklist');
    expect(result.results).toHaveLength(2);
    expect(result.results.map((item) => item.id)).toEqual(['sr22-1', 'c172-1']);
    expect(requestedCollections).toEqual(['c172', 'sr22']);

    expect(getCollectionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'phak' }),
    );
  });

  it('throws when the query is empty after trimming', async () => {
    const { retrievePoh } = await loadTools();

    await expect(retrievePoh.invoke({ query: '   ', k: 1 })).rejects.toThrow(
      'Query must not be empty.',
    );
  });

  it('throws when OPENAI_API_KEY is missing', async () => {
    process.env.OPENAI_API_KEY = '';

    const { retrievePoh } = await loadTools();

    await expect(retrievePoh.invoke({ query: 'test', k: 1 })).rejects.toThrow(
      'OPENAI_API_KEY environment variable is required for retrieval.',
    );
  });

  it('throws when k is not provided as a number', async () => {
    const { retrievePoh } = await loadTools();

    await expect(
      retrievePoh.invoke({ query: 'valid', k: Number.NaN }),
    ).rejects.toThrow('`k` must be provided as a number.');
  });

  it('propagates connection failures when listing collections', async () => {
    const listCollectionsMock = vi
      .fn()
      .mockRejectedValue(new Error('connection refused'));
    const getCollectionMock = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    chromaClientCtor.mockImplementation(() => ({
      listCollections: listCollectionsMock,
      getCollection: getCollectionMock,
    }));

    const { retrievePoh } = await loadTools();

    await expect(retrievePoh.invoke({ query: 'docs', k: 1 })).rejects.toThrow(
      'Unable to connect to ChromaDB. See server logs.',
    );

    expect(consoleError).toHaveBeenCalledWith(
      '[retrieve-poh] Failed to list Chroma collections',
      'connection refused',
    );

    consoleError.mockRestore();
  });

  it('returns an empty result set when only the phak collection exists', async () => {
    const listCollectionsMock = vi.fn().mockResolvedValue([{ name: 'phak' }]);
    const getCollectionMock = vi.fn();

    chromaClientCtor.mockImplementation(() => ({
      listCollections: listCollectionsMock,
      getCollection: getCollectionMock,
    }));

    const { retrievePoh } = await loadTools();

    const result = await retrievePoh.invoke({
      query: 'anything',
      k: 5,
    });

    expect(result.results).toEqual([]);
    expect(getCollectionMock).not.toHaveBeenCalled();
  });

  it('aggregates results from multiple collections', async () => {
    const listCollectionsMock = vi
      .fn()
      .mockResolvedValue([{ name: 'c172' }, { name: 'sr22' }]);

    const c172Query = vi.fn(async () => ({
      rows: () => [
        [{ id: 'c172-1', distance: 0.3, document: 'C172', metadata: {} }],
      ],
    }));

    const sr22Query = vi.fn(async () => ({
      rows: () => [
        [{ id: 'sr22-1', distance: 0.5, document: 'SR22', metadata: {} }],
      ],
    }));

    const getCollectionMock = vi.fn().mockImplementation(async ({ name }) => {
      if (name === 'c172') {
        return { query: c172Query };
      }
      return { query: sr22Query };
    });

    chromaClientCtor.mockImplementation(() => ({
      listCollections: listCollectionsMock,
      getCollection: getCollectionMock,
    }));

    const { retrievePoh } = await loadTools();

    const result = await retrievePoh.invoke({
      query: 'combined',
      k: 5,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: 'c172', id: 'c172-1' }),
        expect.objectContaining({ collection: 'sr22', id: 'sr22-1' }),
      ]),
    );

    expect(c172Query).toHaveBeenCalledTimes(1);
    expect(sr22Query).toHaveBeenCalledTimes(1);
  });

  it('sorts aggregated results by distance placing nulls last', async () => {
    const listCollectionsMock = vi.fn().mockResolvedValue([{ name: 'c172' }]);

    const unorderedRows = [
      {
        id: 'doc-null',
        distance: null,
        document: 'Null distance',
        metadata: {},
      },
      {
        id: 'doc-high',
        distance: 0.9,
        document: 'High distance',
        metadata: {},
      },
      { id: 'doc-low', distance: 0.1, document: 'Low distance', metadata: {} },
    ];

    const queryMock = vi.fn(async () => ({
      rows: () => [unorderedRows],
    }));

    const getCollectionMock = vi.fn().mockResolvedValue({ query: queryMock });

    chromaClientCtor.mockImplementation(() => ({
      listCollections: listCollectionsMock,
      getCollection: getCollectionMock,
    }));

    const { retrievePoh } = await loadTools();

    const result = await retrievePoh.invoke({
      query: 'order please',
      k: 3,
    });

    expect(result.results.map((item) => item.id)).toEqual([
      'doc-low',
      'doc-high',
      'doc-null',
    ]);
  });
});
