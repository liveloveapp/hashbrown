import process from 'node:process';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ChromaClient } from 'chromadb';

import { ingestAllPdfs, type IngestionResult } from './ingest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_ENV_PATH = path.resolve(__dirname, '../../../../.env');

dotenv.config({ path: ROOT_ENV_PATH });

function createChromaClient(): ChromaClient {
  const chromaUrl = process.env.CHROMA_URL ?? 'http://localhost:8000';
  const parsedUrl = new URL(chromaUrl);
  const ssl = parsedUrl.protocol === 'https:';
  const port =
    parsedUrl.port !== ''
      ? Number.parseInt(parsedUrl.port, 10)
      : ssl
        ? 443
        : 8000;
  const apiPath =
    parsedUrl.pathname && parsedUrl.pathname !== '/'
      ? parsedUrl.pathname
      : undefined;

  const options: {
    host: string;
    port: number;
    ssl: boolean;
    path?: string;
  } = {
    host: parsedUrl.hostname,
    port,
    ssl,
  };

  if (apiPath) {
    options.path = apiPath;
  }

  return new ChromaClient(options);
}

interface VerificationResult extends IngestionResult {
  storedCount: number;
}

async function verifyCollections(
  chromaClient: ChromaClient,
  ingested: IngestionResult[],
): Promise<VerificationResult[]> {
  const verifications: VerificationResult[] = [];

  for (const result of ingested) {
    const collection = await chromaClient.getCollection({
      name: result.collectionName,
    });
    const storedCount = await collection.count();

    if (storedCount < result.chunkCount) {
      throw new Error(
        `Collection "${result.collectionName}" has ${storedCount} record(s), expected at least ${result.chunkCount}.`,
      );
    }

    verifications.push({
      ...result,
      storedCount,
    });
  }

  return verifications;
}

async function main(): Promise<void> {
  const ingested = await ingestAllPdfs();

  if (ingested.length === 0) {
    throw new Error('No PDF files were ingested; verification cannot proceed.');
  }

  const chromaClient = createChromaClient();
  const verificationResults = await verifyCollections(chromaClient, ingested);

  console.log('Verification successful:');
  for (const result of verificationResults) {
    console.log(
      `- ${result.fileName}: ${result.chunkCount} chunks ingested, ${result.storedCount} stored in "${result.collectionName}"`,
    );
  }
}

main().catch((error) => {
  console.error('Verification failed:', error);
  process.exitCode = 1;
});
