import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { OpenAIEmbeddingFunction } from '@chroma-core/openai';
import {
  ChromaClient,
  ChromaUniqueError,
  registerEmbeddingFunction,
} from 'chromadb';

import { parsePdfFile } from './utils/pdf-parser.js';
import { splitTextIntoChunks } from './utils/text-splitter.js';

interface IngestionContext {
  embeddingFunction: OpenAIEmbeddingFunction;
  chromaClient: ChromaClient;
  dataDirectory: string;
}

const PDF_EXTENSION = '.pdf';
const DEFAULT_CHUNK_SIZE = 1_000;
const DEFAULT_CHUNK_OVERLAP = 200;
const DEFAULT_BATCH_SIZE = 200;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_ENV_PATH = path.resolve(__dirname, '../../../../.env');

dotenv.config({ path: ROOT_ENV_PATH });

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

export interface IngestionResult {
  fileName: string;
  collectionName: string;
  chunkCount: number;
}

async function verifyChromaConnection(
  chromaClient: ChromaClient,
): Promise<void> {
  const chromaUrl = process.env.CHROMA_URL ?? 'http://localhost:8000';
  console.log(`Verifying ChromaDB connection to ${chromaUrl}...`);

  try {
    await chromaClient.listCollections();
    console.log('✓ Successfully connected to ChromaDB');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.constructor.name : 'Error';

    if (
      errorName === 'ChromaNotFoundError' ||
      errorMessage.includes('not found')
    ) {
      throw new Error(
        `Failed to connect to ChromaDB at ${chromaUrl}. ` +
          `The server may not be running or the URL is incorrect. ` +
          `Please ensure ChromaDB is running on port 8000 (e.g., using docker-compose up). ` +
          `Original error: ${errorMessage}`,
      );
    }

    if (
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('connect')
    ) {
      throw new Error(
        `Failed to connect to ChromaDB at ${chromaUrl}. ` +
          `Connection refused - the server may not be running. ` +
          `Please ensure ChromaDB is running (e.g., using docker-compose up). ` +
          `Original error: ${errorMessage}`,
      );
    }

    throw new Error(
      `Failed to verify ChromaDB connection to ${chromaUrl}. ` +
        `Error: ${errorMessage}`,
    );
  }
}

function sanitizeCollectionName(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? base : 'collection';
}

async function ingestPdfFile(
  fileName: string,
  { dataDirectory, embeddingFunction, chromaClient }: IngestionContext,
): Promise<IngestionResult | null> {
  const filePath = path.join(dataDirectory, fileName);
  const collectionName = sanitizeCollectionName(
    fileName.replace(new RegExp(`${PDF_EXTENSION}$`, 'i'), ''),
  );

  console.log(`\nProcessing ${fileName} -> collection "${collectionName}"`);

  const text = await parsePdfFile(filePath);
  if (!text.trim()) {
    console.warn(`Skipping ${fileName}: no extractable text content.`);
    return null;
  }

  const chunks = await splitTextIntoChunks(
    text,
    DEFAULT_CHUNK_SIZE,
    DEFAULT_CHUNK_OVERLAP,
  );
  if (chunks.length === 0) {
    console.warn(`Skipping ${fileName}: text splitting produced no chunks.`);
    return null;
  }

  let collection;
  try {
    collection = await chromaClient.createCollection({
      name: collectionName,
      embeddingFunction,
    });
  } catch (error) {
    if (error instanceof ChromaUniqueError) {
      collection = await chromaClient.getCollection({
        name: collectionName,
        embeddingFunction,
      });
    } else {
      throw error;
    }
  }

  const batchSize = Number.parseInt(
    process.env.CHROMA_INGEST_BATCH_SIZE ?? '',
    10,
  );
  const effectiveBatchSize =
    Number.isFinite(batchSize) && batchSize > 0
      ? batchSize
      : DEFAULT_BATCH_SIZE;

  const totalChunks = chunks.length;
  const totalBatches = Math.ceil(totalChunks / effectiveBatchSize);

  console.log(
    `Writing ${totalChunks} chunks to ChromaDB in ${totalBatches} batch(es)...`,
  );

  for (let index = 0; index < totalChunks; index += effectiveBatchSize) {
    const slice = chunks.slice(index, index + effectiveBatchSize);
    const documents = slice.map((chunk) => chunk.text);
    const metadatas = slice.map((chunk) => ({
      source: fileName,
      chunk_index: chunk.chunkIndex,
      text: chunk.text,
      start: chunk.start,
      end: chunk.end,
    }));
    const ids = slice.map((chunk) => `${collectionName}-${chunk.chunkIndex}`);

    const batchNumber = Math.floor(index / effectiveBatchSize) + 1;
    console.log(
      `  Upserting batch ${batchNumber}/${totalBatches} containing ${slice.length} chunk(s)...`,
    );

    await collection.upsert({
      ids,
      documents,
      metadatas,
    });
  }

  console.log(`Completed ${fileName}.`);

  return {
    fileName,
    collectionName,
    chunkCount: chunks.length,
  };
}

export async function ingestAllPdfs(
  fileNames?: string[],
): Promise<IngestionResult[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required.');
  }

  const dataDirectory = path.resolve(__dirname, '../data');

  let entries: string[];
  try {
    entries = await fs.readdir(dataDirectory);
  } catch (error) {
    throw new Error(
      `Failed to read data directory at ${dataDirectory}: ${String(error)}`,
    );
  }

  let pdfFiles = entries.filter(
    (entry) => path.extname(entry).toLowerCase() === PDF_EXTENSION,
  );

  if (fileNames && fileNames.length > 0) {
    const requested = new Set(fileNames);
    pdfFiles = pdfFiles.filter((file) => requested.has(file));

    if (pdfFiles.length === 0) {
      console.warn(
        `Requested PDF(s) not found in ${dataDirectory}: ${fileNames.join(', ')}`,
      );
      return [];
    }
  }

  if (pdfFiles.length === 0) {
    console.warn(`No PDF files found in ${dataDirectory}. Nothing to ingest.`);
    return [];
  }

  const embeddingFunction = new OpenAIEmbeddingFunction({
    apiKey: process.env.OPENAI_API_KEY,
    modelName: process.env.CHROMA_EMBED_MODEL ?? 'text-embedding-3-small',
  });
  const chromaClient = new ChromaClient();

  await verifyChromaConnection(chromaClient);

  const context: IngestionContext = {
    embeddingFunction,
    chromaClient,
    dataDirectory,
  };

  const results: IngestionResult[] = [];

  for (const fileName of pdfFiles) {
    try {
      const result = await ingestPdfFile(fileName, context);
      if (result) {
        results.push(result);
      }
    } catch (error) {
      console.error(`Failed to ingest ${fileName}:`, error);
    }
  }

  return results;
}

const invokedDirectly = process.argv.some(
  (argument, index) => index > 0 && path.resolve(argument) === __filename,
);

if (invokedDirectly) {
  ingestAllPdfs()
    .then((results) => {
      if (results.length === 0) {
        console.warn('No PDF files ingested.');
      } else {
        console.log(
          `Ingested ${results.length} file(s): ${results
            .map((result) => `${result.fileName} (${result.chunkCount} chunks)`)
            .join(', ')}`,
        );
      }
    })
    .catch((error) => {
      console.error('Ingestion failed:', error);
      process.exitCode = 1;
    });
}
