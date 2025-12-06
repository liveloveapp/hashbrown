#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CSV_PATH = path.resolve('samples/finance/angular/public/fastfood_v2.csv');
const OUTPUT_DIR = path.resolve('samples/finance/angular/public/favicons');
const USER_AGENT =
  'Hashbrown-Favicon-Script/1.0 (+https://github.com/liveloveapp/hashbrown)';
const CONCURRENCY = 5;

type DownloadedIcon = {
  buffer: Buffer;
  contentType: string;
  sourceUrl: string;
};

const ICON_REL_REGEX = /<link[^>]+rel=["']([^"']+)["'][^>]*>/gi;
const HREF_REGEX = /href=["']([^"']+)["']/i;

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const csv = await readFile(CSV_PATH, 'utf8');
  const uniqueOrigins = extractOrigins(csv);

  if (uniqueOrigins.length === 0) {
    console.warn('No URLs found in CSV.');
    return;
  }

  console.log(
    `Discovered ${uniqueOrigins.length} unique origins. Downloading favicons...`,
  );

  const errors: string[] = [];

  await runWithConcurrency(
    uniqueOrigins,
    async (origin) => {
      try {
        const icon = await downloadIconForOrigin(origin);
        if (icon) {
          const ext = determineExtension(icon.sourceUrl, icon.contentType);
          const targetFile = path.join(
            OUTPUT_DIR,
            `${sanitizeFilename(origin)}${ext}`,
          );
          await writeFile(targetFile, icon.buffer);
          console.log(
            `✓ Saved ${origin} -> ${path.relative(process.cwd(), targetFile)}`,
          );
        } else {
          const message = `No favicon found for ${origin}`;
          console.warn(`⚠️  ${message}`);
          errors.push(message);
        }
      } catch (error) {
        const message = `Failed to download favicon for ${origin}: ${String(
          (error as Error).message || error,
        )}`;
        console.warn(`⚠️  ${message}`);
        errors.push(message);
      }
    },
    CONCURRENCY,
  );

  if (errors.length) {
    console.log('\nCompleted with warnings:');
    errors.forEach((err) => console.log(` - ${err}`));
  } else {
    console.log('\nAll favicons downloaded successfully.');
  }
}

function extractOrigins(csv: string): string[] {
  const origins = new Set<string>();
  const lines = csv.split(/\r?\n/);

  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lastComma = trimmed.lastIndexOf(',');
    if (lastComma === -1) continue;
    const beforeLast = trimmed.slice(0, lastComma);
    const secondLastComma = beforeLast.lastIndexOf(',');
    if (secondLastComma === -1) continue;
    let sourcesField = beforeLast.slice(secondLastComma + 1).trim();
    if (!sourcesField) continue;
    if (
      (sourcesField.startsWith('"') && sourcesField.endsWith('"')) ||
      (sourcesField.startsWith("'") && sourcesField.endsWith("'"))
    ) {
      sourcesField = sourcesField.slice(1, -1);
    }

    for (const entry of sourcesField.split('|')) {
      const url = entry.trim();
      if (!url) continue;
      try {
        origins.add(new URL(url).origin);
      } catch {
        console.warn(`Skipping invalid URL: ${url}`);
      }
    }
  }

  return Array.from(origins).sort();
}

async function downloadIconForOrigin(
  originUrl: string,
): Promise<DownloadedIcon | null> {
  const origin = new URL(originUrl);

  const defaultIconUrl = new URL('/favicon.ico', origin);
  const defaultIcon = await tryDownload(defaultIconUrl);
  if (defaultIcon) {
    return defaultIcon;
  }

  try {
    const pageResponse = await safeFetch(origin.href);
    if (!pageResponse.ok) {
      throw new Error(`status ${pageResponse.status}`);
    }
    const html = await pageResponse.text();
    const baseUrl = pageResponse.url || origin.href;
    const iconHrefs = extractIconHrefs(html);

    for (const href of iconHrefs) {
      try {
        const absolute = new URL(href, baseUrl);
        const downloaded = await tryDownload(absolute);
        if (downloaded) {
          return downloaded;
        }
      } catch {
        // Ignore malformed hrefs
      }
    }
  } catch (error) {
    console.warn(`Could not inspect HTML for ${originUrl}: ${String(error)}`);
  }

  return null;
}

async function tryDownload(url: URL): Promise<DownloadedIcon | null> {
  try {
    const response = await safeFetch(url.href);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      // Some servers return octet-stream for ICOs, allow if file looks like image bytes
      if (
        !contentType.includes('octet-stream') &&
        !contentType.includes('application/x-ico')
      ) {
        return null;
      }
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return null;
    return {
      buffer,
      contentType,
      sourceUrl: response.url || url.href,
    };
  } catch {
    return null;
  }
}

function extractIconHrefs(html: string): string[] {
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = ICON_REL_REGEX.exec(html)) !== null) {
    const relValue = match[1]?.toLowerCase() ?? '';
    if (!relValue.includes('icon')) continue;
    const tag = match[0];
    const hrefMatch = HREF_REGEX.exec(tag);
    if (hrefMatch && hrefMatch[1]) {
      hrefs.push(hrefMatch[1]);
    }
  }
  return hrefs;
}

function sanitizeFilename(origin: string): string {
  const { hostname } = new URL(origin);
  return hostname.replace(/[^a-z0-9.-]/gi, '_');
}

function determineExtension(url: string, contentType: string): string {
  const parsed = new URL(url);
  const extFromUrl = path.extname(parsed.pathname);
  if (extFromUrl) {
    return extFromUrl;
  }

  if (contentType.includes('svg')) return '.svg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('jpeg') || contentType.includes('jpg'))
    return '.jpg';
  if (contentType.includes('gif')) return '.gif';

  return '.ico';
}

async function safeFetch(url: string) {
  return fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'image/*,text/html;q=0.9,*/*;q=0.1',
    },
    redirect: 'follow',
  });
}

async function runWithConcurrency<T>(
  list: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
) {
  const executing = new Set<Promise<void>>();
  for (const item of list) {
    const p = worker(item).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
