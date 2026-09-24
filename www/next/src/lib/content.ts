import fm from 'front-matter';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { repoRoot } from './repo-root';

/** The frameworks the docs are written for. */
export type Sdk = 'react' | 'angular';

/** The SDKs with a docs tree. */
export const SDKS: readonly Sdk[] = ['react', 'angular'];

/** A docs page: its frontmatter metadata and markdown body. */
export interface DocPage {
  title: string;
  description: string | undefined;
  body: string;
}

/** A blog post: its frontmatter metadata and markdown body. */
export interface BlogPost {
  /** URL slug: the file name without `.md`, as Analog's content routes use. */
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  body: string;
}

interface DocAttributes {
  title?: string;
  meta?: { name?: string; content?: string }[];
}

interface PostAttributes {
  title: string;
  description: string;
  tags?: string[];
}

const docsRoot = (sdk: Sdk) =>
  join(repoRoot(), 'www/analog/src/app/pages/docs', sdk);
const blogRoot = () => join(repoRoot(), 'www/analog/src/content/blog');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/**
 * List every docs page for an SDK as slug segments, e.g. `['start', 'quick']`.
 *
 * @param sdk - Which docs tree to list.
 */
export function listDocs(sdk: Sdk): string[][] {
  const root = docsRoot(sdk);
  return walk(root)
    .filter((file) => file.endsWith('.md'))
    .map((file) => relative(root, file).replace(/\.md$/, '').split(sep))
    .sort((a, b) => a.join('/').localeCompare(b.join('/')));
}

/**
 * Read one docs page. Returns `undefined` when the page doesn't exist or the
 * slug points outside the SDK's docs directory.
 *
 * @param sdk - Which docs tree to read from.
 * @param slug - Path segments below the SDK root, without `.md`.
 */
export function readDoc(
  sdk: Sdk,
  slug: readonly string[],
): DocPage | undefined {
  const root = docsRoot(sdk);
  const file = resolve(root, `${slug.join('/')}.md`);
  if (!file.startsWith(root + sep) || !existsSync(file)) {
    return undefined;
  }
  const { attributes, body } = fm<DocAttributes>(readFileSync(file, 'utf-8'));
  return {
    title: attributes.title ?? slug[slug.length - 1],
    description: attributes.meta?.find((m) => m.name === 'description')
      ?.content,
    body,
  };
}

function toPost(file: string): BlogPost {
  const { attributes, body } = fm<PostAttributes>(readFileSync(file, 'utf-8'));
  const slug = basename(file, '.md');
  return {
    slug,
    title: attributes.title,
    description: attributes.description,
    date: slug.slice(0, 10),
    tags: attributes.tags ?? [],
    body,
  };
}

/** List blog posts, newest first (post file names start with an ISO date). */
export function listBlogPosts(): BlogPost[] {
  return readdirSync(blogRoot())
    .filter((name) => name.endsWith('.md'))
    .map((name) => toPost(join(blogRoot(), name)))
    .sort((a, b) => b.slug.localeCompare(a.slug));
}

/**
 * Read one blog post by its URL slug.
 *
 * @param slug - The post's file name without `.md`.
 */
export function readBlogPost(slug: string): BlogPost | undefined {
  return listBlogPosts().find((post) => post.slug === slug);
}
