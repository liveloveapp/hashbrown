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
  /** Open Graph image URL from frontmatter (absolute, or a site path), if the post sets one. */
  ogImage: string | undefined;
  /** Alt text for the frontmatter `ogImage`. */
  ogImageAlt: string | undefined;
  /** Team member ids for the byline; each maps to `/image/team/<id>.png`. */
  team: string[];
  /** YouTube URL for posts that embed a video (talks). */
  youtube: string | undefined;
  /** Frontmatter `published`; only `true` makes a post public. */
  published: boolean;
  /** When the post goes public: frontmatter `publishAt`, else 00:00 UTC on its file-name date. */
  publishAt: Date;
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
  ogImage?: string;
  ogImageAlt?: string;
  team?: string[];
  youtube?: string;
  published?: boolean;
  /** YAML parses an unquoted timestamp as a Date; a quoted one stays a string. */
  publishAt?: Date | string;
}

const docsRoot = (sdk: Sdk) => join(repoRoot(), 'www/content/docs', sdk);
const blogRoot = () => join(repoRoot(), 'www/content/blog');

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

/** A timestamp with an explicit offset, so a post's go-live time is never read in the build's zone. */
const OFFSET_TIMESTAMP = /(?:Z|[+-]\d{2}:\d{2})$/;

function toPublishAt(
  file: string,
  slug: string,
  value: Date | string | undefined,
): Date {
  if (value === undefined) return new Date(`${slug.slice(0, 10)}T00:00:00Z`);
  const at =
    value instanceof Date
      ? value
      : OFFSET_TIMESTAMP.test(value)
        ? new Date(value)
        : new Date(NaN);
  if (Number.isNaN(at.getTime())) {
    throw new Error(
      `${file}: publishAt must be a timestamp with an offset, e.g. 2026-11-04T10:00:00-05:00`,
    );
  }
  return at;
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
    ogImage: attributes.ogImage,
    ogImageAlt: attributes.ogImageAlt,
    team: attributes.team ?? [],
    youtube: attributes.youtube,
    published: attributes.published === true,
    publishAt: toPublishAt(file, slug, attributes.publishAt),
    body,
  };
}

/**
 * Whether a post is public at `now`: `published: true` and its `publishAt` has
 * passed. Drafts and scheduled posts are left out everywhere, so a post can be
 * merged ahead of its date and appear when the blog pages next revalidate.
 *
 * @param post - The post to check.
 * @param now - The moment to check against.
 */
export function isPublished(
  post: Pick<BlogPost, 'published' | 'publishAt'>,
  now: Date,
): boolean {
  return post.published && post.publishAt.getTime() <= now.getTime();
}

/**
 * Every post file, published or not, newest first. Only for checks over the
 * content itself; pages use `listBlogPosts`.
 */
export function listAllBlogPosts(): BlogPost[] {
  return readdirSync(blogRoot())
    .filter((name) => name.endsWith('.md'))
    .map((name) => toPost(join(blogRoot(), name)))
    .sort((a, b) => b.slug.localeCompare(a.slug));
}

/**
 * List the published blog posts, newest first (post file names start with an
 * ISO date).
 *
 * @param now - The moment to check `isPublished` against; defaults to now.
 */
export function listBlogPosts(now: Date = new Date()): BlogPost[] {
  return listAllBlogPosts().filter((post) => isPublished(post, now));
}

/**
 * Read one published blog post by its URL slug.
 *
 * @param slug - The post's file name without `.md`.
 * @param now - The moment to check `isPublished` against; defaults to now.
 */
export function readBlogPost(
  slug: string,
  now: Date = new Date(),
): BlogPost | undefined {
  return listBlogPosts(now).find((post) => post.slug === slug);
}
