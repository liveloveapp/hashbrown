import process from 'node:process';

import { ChromaClient } from 'chromadb';

import { ingestAllPdfs, type IngestionResult } from './index.js';

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

  const chromaClient = new ChromaClient();
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
