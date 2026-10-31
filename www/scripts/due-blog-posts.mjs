#!/usr/bin/env node
// Finds blog posts whose publishAt passed recently but that hashbrown.dev
// still answers 404 for, so the scheduled `Blog Publish` workflow knows to
// redeploy www. The blog pages are static: a post merged ahead of its
// publishAt only appears once a build runs after that time.
//
// Dependency-free so the workflow can run it without `npm ci`. The rules
// match `isPublished` in www/src/lib/content.ts; www/test/due-blog-posts.spec.ts
// checks the two agree on every post.
//
// Usage: node www/scripts/due-blog-posts.mjs
// Prints `redeploy=true|false` (append it to $GITHUB_OUTPUT).

import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Posts that came due longer ago than this are left alone, so one broken post can't redeploy forever. */
export const LOOKBACK_MS = 48 * 60 * 60 * 1000;

export const SITE_URL = 'https://hashbrown.dev';

const OFFSET_TIMESTAMP = /(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * The `published` flag and go-live time of one post file.
 *
 * @param file - Path to the post's markdown file.
 * @param text - The file's contents.
 * @returns `{ slug, published, publishAt }`.
 */
export function readSchedule(file, text) {
  const slug = basename(file, '.md');
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  const field = (name) =>
    new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm')
      .exec(front)?.[1]
      ?.replace(/^(['"])(.*)\1$/, '$2');
  const raw = field('publishAt');
  const publishAt =
    raw === undefined
      ? new Date(`${slug.slice(0, 10)}T00:00:00Z`)
      : OFFSET_TIMESTAMP.test(raw)
        ? new Date(raw)
        : new Date(NaN);
  if (Number.isNaN(publishAt.getTime())) {
    throw new Error(`${file}: publishAt must be a timestamp with an offset`);
  }
  return { slug, published: field('published') === 'true', publishAt };
}

/**
 * Published posts whose publishAt is within the lookback and not in the future.
 *
 * @param posts - Schedules from `readSchedule`.
 * @param now - The current time.
 */
export function recentlyDue(posts, now) {
  return posts.filter(
    (post) =>
      post.published &&
      post.publishAt.getTime() <= now.getTime() &&
      now.getTime() - post.publishAt.getTime() <= LOOKBACK_MS,
  );
}

/**
 * Whether any recently due post is still missing from the live site.
 *
 * @param posts - Schedules from `readSchedule`.
 * @param now - The current time.
 * @param fetchImpl - `fetch`, replaceable in tests.
 */
export async function needsRedeploy(posts, now, fetchImpl = fetch) {
  for (const post of recentlyDue(posts, now)) {
    const response = await fetchImpl(`${SITE_URL}/blog/${post.slug}`, {
      method: 'HEAD',
      redirect: 'manual',
    });
    if (response.status === 404) return true;
  }
  return false;
}

async function main() {
  const blogDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../content/blog',
  );
  const posts = readdirSync(blogDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const file = join(blogDir, name);
      return readSchedule(file, readFileSync(file, 'utf8'));
    });
  const now = new Date();
  for (const post of recentlyDue(posts, now)) {
    console.error(
      `due: ${post.slug} (publishAt ${post.publishAt.toISOString()})`,
    );
  }
  console.log(`redeploy=${await needsRedeploy(posts, now)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
