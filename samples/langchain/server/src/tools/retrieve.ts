import { ChromaClient, registerEmbeddingFunction } from 'chromadb';
import { OpenAIEmbeddingFunction } from '@chroma-core/openai';
import { tool } from 'langchain';
import { z } from 'zod';

const MAX_K = 25;
const PHAK_COLLECTION = 'phak';

try {
  registerEmbeddingFunction('openai', OpenAIEmbeddingFunction);
} catch (error) {
  if (
    !(error instanceof Error) ||
    !error.message.includes('already registered')
  ) {
    throw error;
  }
}

const CHROMA_WARNING_PATTERNS = [
  'Unknown embedding function configuration for collection schema deserialization.',
  'was created with the undefined embedding function.',
  '@chroma-core/undefined',
];

const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
let chromaWarningDepth = 0;

function shouldSuppressChromaWarning(args: unknown[]): boolean {
  if (args.length === 0) {
    return false;
  }

  const [first] = args;
  if (typeof first !== 'string') {
    return false;
  }

  return CHROMA_WARNING_PATTERNS.some((pattern) => first.includes(pattern));
}

async function suppressChromaWarnings<T>(
  operation: () => Promise<T>,
): Promise<T> {
  chromaWarningDepth += 1;

  if (chromaWarningDepth === 1) {
    console.error = ((...args: unknown[]) => {
      if (shouldSuppressChromaWarning(args)) {
        return;
      }
      originalConsoleError(...(args as Parameters<typeof console.error>));
    }) as typeof console.error;

    console.warn = ((...args: unknown[]) => {
      if (shouldSuppressChromaWarning(args)) {
        return;
      }
      originalConsoleWarn(...(args as Parameters<typeof console.warn>));
    }) as typeof console.warn;
  }

  try {
    return await operation();
  } finally {
    chromaWarningDepth = Math.max(chromaWarningDepth - 1, 0);
    if (chromaWarningDepth === 0) {
      console.error = originalConsoleError as typeof console.error;
      console.warn = originalConsoleWarn as typeof console.warn;
    }
  }
}

interface RetrievalResult {
  collection: string;
  id: string;
  distance: number | null;
  text: string;
}

const toolSchema = z.object({
  query: z
    .string()
    .min(1, 'Query text is required.')
    .describe('The search query text.'),
  k: z
    .number()
    .int()
    .positive()
    .max(MAX_K)
    .describe(
      `Maximum number of results to return (must be between 1 and ${MAX_K}, inclusive).`,
    ),
});

function validateInputs(query: string, k: number) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error('Query must not be empty.');
  }

  if (typeof k !== 'number' || Number.isNaN(k)) {
    throw new Error('`k` must be provided as a number.');
  }

  const limit = Math.max(1, Math.min(k, MAX_K));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is required for retrieval.',
    );
  }

  return { trimmedQuery, limit, apiKey };
}

function createChromaClient() {
  const chromaUrl = process.env.CHROMA_URL ?? 'http://localhost:8000';
  const parsedUrl = new URL(chromaUrl);
  const ssl = parsedUrl.protocol === 'https:';
  const port =
    parsedUrl.port !== ''
      ? Number.parseInt(parsedUrl.port, 10)
      : ssl
        ? 443
        : 8000;
  const path =
    parsedUrl.pathname && parsedUrl.pathname !== '/'
      ? parsedUrl.pathname
      : undefined;

  const clientOptions: {
    host: string;
    port: number;
    ssl: boolean;
    path?: string;
  } = {
    host: parsedUrl.hostname,
    port,
    ssl,
  };

  if (path) {
    clientOptions.path = path;
  }

  return new ChromaClient(clientOptions);
}

async function runRetrieval({
  query,
  k,
  toolName,
  collectionFilter,
}: {
  query: string;
  k: number;
  toolName: string;
  collectionFilter: (collectionName: string) => boolean;
}) {
  const { trimmedQuery, limit, apiKey } = validateInputs(query, k);
  return suppressChromaWarnings(async () => {
    const chromaClient = createChromaClient();

    let collections;
    try {
      collections = await chromaClient.listCollections();
    } catch (error) {
      console.error(
        `[${toolName}] Failed to list Chroma collections`,
        error instanceof Error ? error.message : error,
      );
      throw new Error('Unable to connect to ChromaDB. See server logs.');
    }

    const filteredCollections = collections.filter(
      ({ name }) => typeof name === 'string' && collectionFilter(name),
    );

    if (filteredCollections.length === 0) {
      return {
        query: trimmedQuery,
        results: [] as RetrievalResult[],
      };
    }

    const embeddingFunction = new OpenAIEmbeddingFunction({
      apiKey,
      modelName: process.env.CHROMA_EMBED_MODEL ?? 'text-embedding-3-small',
    });

    const aggregated: RetrievalResult[] = [];

    for (const { name } of filteredCollections) {
      if (!name) {
        continue;
      }

      try {
        const collection = await chromaClient.getCollection({
          name,
          embeddingFunction,
        });

        const queryResult = await collection.query({
          queryTexts: [trimmedQuery],
          nResults: limit,
          include: ['documents', 'distances'],
        });

        const rows = queryResult.rows()[0] ?? [];
        for (const row of rows) {
          if (!row.document) {
            continue;
          }

          aggregated.push({
            collection: name,
            id: row.id,
            distance: typeof row.distance === 'number' ? row.distance : null,
            text: row.document,
          });
        }
      } catch (error) {
        console.error(
          `[${toolName}] Error querying collection "${name}":`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    aggregated.sort(
      (a, b) =>
        (a.distance ?? Number.POSITIVE_INFINITY) -
        (b.distance ?? Number.POSITIVE_INFINITY),
    );

    const results = aggregated.slice(0, limit);

    return {
      query: trimmedQuery,
      results,
    };
  });
}

export const retrievePhak = tool(
  async ({ query, k }: { query: string; k: number }) =>
    runRetrieval({
      query,
      k,
      toolName: 'retrieve_phak',
      collectionFilter: (name) => name === PHAK_COLLECTION,
    }),
  {
    name: 'retrieve_phak',
    description:
      "Searches the PHAK (Pilot's Handbook of Aeronautical Knowledge) collection for aeronautical information and concepts.",
    schema: toolSchema,
  },
);

export const retrievePoh = tool(
  async ({ query, k }: { query: string; k: number }) =>
    runRetrieval({
      query,
      k,
      toolName: 'retrieve_poh',
      collectionFilter: (name) => name !== PHAK_COLLECTION,
    }),
  {
    name: 'retrieve_poh',
    description:
      "Searches POH (Pilot's Operating Handbook) and other aircraft-specific collections for aircraft operation details.",
    schema: toolSchema,
  },
);
