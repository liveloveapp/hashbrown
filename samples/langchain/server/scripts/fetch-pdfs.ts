import fs from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

export type DownloadSpec = {
  filename: string;
  url: string;
};

export type FetchResult = {
  downloaded: string[];
  skipped: string[];
  failed: { filename: string; message: string }[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DATA_DIR = path.resolve(__dirname, '../data');

const googleDriveShareUrl =
  'https://drive.google.com/file/d/1_iBmEX0fW-acF3vRIXtSWGbEK1CzPbD8/view?usp=share_link';

const downloads: DownloadSpec[] = [
  {
    filename: 'phak.pdf',
    url: 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/faa-h-8083-25c.pdf',
  },
  {
    filename: 'poh.pdf',
    url: toGoogleDriveDirectDownloadUrl(googleDriveShareUrl),
  },
];

export const DOWNLOADS = downloads;

function toGoogleDriveDirectDownloadUrl(shareUrl: string): string {
  const idFromPath = shareUrl.match(/\/d\/([^/]+)/)?.[1];

  if (idFromPath) {
    return `https://drive.google.com/uc?export=download&id=${idFromPath}`;
  }

  let idFromQuery: string | null = null;
  try {
    idFromQuery = new URL(shareUrl).searchParams.get('id');
  } catch {
    // ignore parse errors and fall through
  }

  if (idFromQuery) {
    return `https://drive.google.com/uc?export=download&id=${idFromQuery}`;
  }

  throw new Error('Could not extract Google Drive file ID from provided URL');
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Request failed with status ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error('Response contained no body to read');
  }

  const nodeReadable = Readable.fromWeb(
    response.body as unknown as ReadableStream,
  );
  const fileStream = fs.createWriteStream(destination);

  await pipeline(nodeReadable, fileStream);
}

export async function fetchPdfs(
  downloadList: DownloadSpec[] = DOWNLOADS,
): Promise<FetchResult> {
  await ensureDataDir();

  const result: FetchResult = {
    downloaded: [],
    skipped: [],
    failed: [],
  };

  for (const { filename, url } of downloadList) {
    const destination = path.join(DATA_DIR, filename);
    const relativeDestination = path.relative(process.cwd(), destination);

    if (await fileExists(destination)) {
      console.log(
        `[skip] ${filename} already exists at ${relativeDestination}`,
      );
      result.skipped.push(filename);
      continue;
    }

    console.log(`[fetch] Downloading ${filename} from ${url}`);

    try {
      await downloadFile(url, destination);
      console.log(`[ok] Saved ${filename} to ${relativeDestination}`);
      result.downloaded.push(filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ filename, message });
      console.error(`[error] Failed to download ${filename}: ${message}`);

      try {
        await fs.promises.rm(destination, { force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }

  return result;
}

async function run(): Promise<void> {
  const result = await fetchPdfs();

  if (result.failed.length > 0) {
    console.error('One or more downloads failed. See logs above for details.');
    process.exitCode = 1;
  }

  console.log('PDF fetch complete.');
}

run().catch((error) => {
  console.error(
    `[fatal] Unexpected error: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
});
