import dotenv from 'dotenv';
import { exec as execCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ChromaClient } from 'chromadb';
import { ingestAllPdfs } from './ingest.js';
import {
  DATA_DIR,
  DOWNLOADS,
  fetchPdfs,
  type DownloadSpec,
} from './fetch-pdfs.js';

const execAsync = promisify(execCallback);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_ENV_PATH = path.resolve(__dirname, '../../../../.env');

dotenv.config({ path: ROOT_ENV_PATH });

const COMPOSE_FILE = path.resolve(__dirname, '../docker-compose.yml');
const CHROMA_URL = process.env.CHROMA_URL ?? 'http://localhost:8000';
const HEARTBEAT_PATHS = ['/api/v2/heartbeat', '/api/v1/heartbeat'];
const REQUIRED_PDFS = DOWNLOADS.map((entry) => entry.filename);

function logStep(message: string): void {
  console.log(`[step] ${message}`);
}

function logOk(message: string): void {
  console.log(`[ok] ${message}`);
}

function logSkip(message: string): void {
  console.log(`[skip] ${message}`);
}

function logWarn(message: string): void {
  console.warn(`[warn] ${message}`);
}

function logError(message: string): void {
  console.error(`[error] ${message}`);
}

function buildHeartbeatUrls(baseUrl: string): string[] {
  try {
    const base = new URL(baseUrl);
    return HEARTBEAT_PATHS.map((path) => {
      const url = new URL(base);
      url.pathname = path;
      return url.toString();
    });
  } catch {
    return HEARTBEAT_PATHS.map((path) => `http://localhost:8000${path}`);
  }
}

function collectionNameForPdf(fileName: string): string {
  const parsed = path.parse(fileName);
  // Use basename without extension to mirror ingest collection naming.
  const baseName = parsed.name;
  const base = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base.length > 0 ? base : 'collection';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checkRequiredPdfs(required: string[]): Promise<{
  missing: string[];
  existing: string[];
}> {
  const missing: string[] = [];
  const existing: string[] = [];

  for (const fileName of required) {
    const filePath = path.join(DATA_DIR, fileName);
    if (await fileExists(filePath)) {
      existing.push(fileName);
    } else {
      missing.push(fileName);
    }
  }

  return { missing, existing };
}

async function downloadMissingPdfs(missing: string[]): Promise<void> {
  const subset: DownloadSpec[] = DOWNLOADS.filter((download) =>
    missing.includes(download.filename),
  );

  if (subset.length === 0) {
    return;
  }

  const result = await fetchPdfs(subset);

  if (result.failed.length > 0) {
    const details = result.failed
      .map((item) => `${item.filename}: ${item.message}`)
      .join('; ');
    throw new Error(`Failed to download required PDFs: ${details}`);
  }

  const postCheck = await checkRequiredPdfs(
    subset.map((entry) => entry.filename),
  );

  if (postCheck.missing.length > 0) {
    throw new Error(
      `Missing required PDFs after download attempt: ${postCheck.missing.join(', ')}`,
    );
  }
}

async function isChromaHeartbeatHealthy(): Promise<boolean> {
  const candidates = buildHeartbeatUrls(CHROMA_URL);

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      });

      if (response.ok) {
        return true;
      }

      // Chroma 0.6+ responds 410 on the old v1 endpoint; treat as "server is up"
      if (response.status === 410) {
        return true;
      }
    } catch {
      // ignore and continue to next candidate
    }
  }

  return false;
}

async function resolveComposeCommand(): Promise<string> {
  const candidates = ['docker compose', 'docker-compose'];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      await execAsync(`${candidate} version`, {
        cwd: path.dirname(COMPOSE_FILE),
      });
      return candidate;
    } catch (error) {
      lastError = error;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError ?? '');
  throw new Error(
    `Docker Compose is required to start ChromaDB but was not found. ` +
      `Install Docker Desktop or the docker-compose plugin. Last error: ${message}`,
  );
}

async function startChromaDb(): Promise<void> {
  try {
    await fs.access(COMPOSE_FILE);
  } catch {
    throw new Error(
      `Could not find docker-compose.yml at ${COMPOSE_FILE}. Ensure you are running the script from the repo.`,
    );
  }

  const composeCommand = await resolveComposeCommand();
  const composeArgs = `${composeCommand} -f ${COMPOSE_FILE} up -d`;

  logStep(`Starting ChromaDB via "${composeArgs}"...`);
  await execAsync(composeArgs, { cwd: path.dirname(COMPOSE_FILE) });
  logOk('Docker Compose start command issued.');
}

async function waitForChromaDbReady(maxWaitSeconds = 60): Promise<void> {
  const deadline = Date.now() + maxWaitSeconds * 1_000;
  let attempt = 0;

  while (Date.now() < deadline) {
    if (await isChromaHeartbeatHealthy()) {
      logOk(`ChromaDB is ready at ${CHROMA_URL}`);
      return;
    }

    attempt += 1;
    const backoff = Math.min(500 * 2 ** attempt, 5_000);
    logStep(`Waiting for ChromaDB to become ready (attempt ${attempt})...`);
    await delay(backoff);
  }

  throw new Error(
    `Timed out waiting for ChromaDB to become ready at ${CHROMA_URL}.`,
  );
}

async function ensureChromaRunning(): Promise<void> {
  if (await isChromaHeartbeatHealthy()) {
    logOk(`ChromaDB is already running at ${CHROMA_URL}.`);
    return;
  }

  logStep('ChromaDB not detected. Attempting to start via Docker Compose...');
  await startChromaDb();
  await waitForChromaDbReady();
}

async function checkExistingIngestion(requiredPdfs: string[]): Promise<{
  ingested: boolean;
  missingCollections: string[];
  emptyCollections: string[];
}> {
  const chromaClient = new ChromaClient();
  const collections = await chromaClient.listCollections();
  const collectionNames = collections.map((collection) => collection.name);

  const missingCollections: string[] = [];
  const emptyCollections: string[] = [];

  for (const fileName of requiredPdfs) {
    const collectionName = collectionNameForPdf(fileName);

    if (!collectionNames.includes(collectionName)) {
      missingCollections.push(collectionName);
      continue;
    }

    try {
      const collection = await chromaClient.getCollection({
        name: collectionName,
      });
      const count = await collection.count();
      if (count === 0) {
        emptyCollections.push(collectionName);
      }
    } catch {
      missingCollections.push(collectionName);
    }
  }

  return {
    ingested: missingCollections.length === 0 && emptyCollections.length === 0,
    missingCollections,
    emptyCollections,
  };
}

async function runIngestion(forceIngest: boolean): Promise<void> {
  let targets = [...REQUIRED_PDFS];

  if (!forceIngest) {
    const ingestionStatus = await checkExistingIngestion(REQUIRED_PDFS);
    const missingOrEmpty = new Set([
      ...ingestionStatus.missingCollections,
      ...ingestionStatus.emptyCollections,
    ]);

    targets = targets.filter((fileName) =>
      missingOrEmpty.has(collectionNameForPdf(fileName)),
    );

    if (targets.length === 0) {
      logSkip('All required PDFs are already ingested.');
      return;
    }

    if (ingestionStatus.missingCollections.length > 0) {
      logStep(
        `Collections missing for: ${ingestionStatus.missingCollections.join(', ')}`,
      );
    }

    if (ingestionStatus.emptyCollections.length > 0) {
      logStep(
        `Collections present but empty for: ${ingestionStatus.emptyCollections.join(', ')}`,
      );
    }
  } else {
    logStep('Force flag detected; re-ingesting all PDFs.');
  }

  logStep(`Starting ingestion for ${targets.length} PDF(s)...`);
  const results = await ingestAllPdfs(targets);

  if (results.length === 0) {
    logWarn('No PDF files were ingested.');
  } else {
    logOk(
      `Ingested ${results.length} file(s): ${results
        .map((result) => `${result.fileName} (${result.chunkCount} chunks)`)
        .join(', ')}`,
    );
  }
}

async function init(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const forceIngest = args.has('--force') || args.has('--force-ingest');

  logStep('Checking required PDFs...');
  const pdfStatus = await checkRequiredPdfs(REQUIRED_PDFS);

  if (pdfStatus.missing.length > 0) {
    logStep(`Downloading missing PDFs: ${pdfStatus.missing.join(', ')}`);
    await downloadMissingPdfs(pdfStatus.missing);
  } else {
    logOk('All required PDFs are present.');
  }

  await ensureChromaRunning();
  await runIngestion(forceIngest);

  logOk('Initialization complete.');
}

init().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(message);
  process.exitCode = 1;
});
