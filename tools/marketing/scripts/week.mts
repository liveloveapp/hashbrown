import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { z } from 'zod';

// The preflight lives with the growth scripts that own the database rules.
import { validateGrowthDatabaseEnvironment } from '../../growth/scripts/growth-database-preflight.mts';
import { createCredentialStore } from '../src/credentials/store.ts';
import { createDatabaseExecutor, type SqlExecutor } from '../src/growth.ts';
import {
  approvePosts,
  importWeek,
  listPostsByStatus,
  listPublishedWithWarnings,
  readPost,
  readWeek,
  setPostStatus,
  updateBlogDraft,
  updatePostDraft,
} from '../src/queue/repository.ts';
import {
  addDays,
  assertApprovable,
  draftSchemas,
  newYorkDate,
  WeekImport,
} from '../src/queue/schema.ts';
import type {
  BlogDraft,
  PostKind,
  PostStatus,
  QueuedPost,
  QueuedWeek,
  QueueDraft,
  Source,
} from '../src/queue/types.ts';
import { checkVoice, type VoiceIssue } from '../src/voice/check.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** What `week` needs from the queue, the credential store and the blog files. */
export interface WeekOperations {
  readWeek(
    weekStart: string,
  ): Promise<{ week: QueuedWeek; posts: QueuedPost[] } | undefined>;
  readPost(id: string): Promise<QueuedPost | undefined>;
  importWeek(
    week: WeekImport,
  ): Promise<{ weekId: string; postIds: Record<string, string> }>;
  updatePostDraft(
    id: string,
    patch: {
      draft?: QueueDraft;
      scheduledAt?: Date;
      kind?: PostKind;
      sources?: Source[];
    },
  ): Promise<void>;
  approvePosts(weekId: string, postId?: string): Promise<number>;
  setPostStatus(id: string, status: 'held' | 'cancelled'): Promise<void>;
  updateBlogDraft(id: string, patch: Partial<BlogDraft>): Promise<void>;
  listPostsByStatus(statuses: readonly PostStatus[]): Promise<QueuedPost[]>;
  /** Published posts with a warning in `lastError`, published since `since`. */
  listPublishedWithWarnings(since: Date): Promise<QueuedPost[]>;
  /** Absent when `MARKETING_CREDENTIALS_KEY` is not set. */
  expiringWithin?(
    now: Date,
    days: number,
  ): Promise<Array<{ channel: string; expiresAt: string }>>;
  /** The markdown of `www/content/blog/<slug>.md`, when it exists locally. */
  readBlogBody(slug: string): Promise<string | undefined>;
}

/** Injected operations, clock, file reader and output sinks. */
export interface WeekRunnerDependencies {
  operations: WeekOperations;
  now(): Date;
  readFile(path: string): Promise<string>;
  writeOutput(line: string): void;
  writeError(line: string): void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back `status` looks for published posts that carry a warning. */
const WARNING_LOOKBACK_DAYS = 14;

class WeekUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeekUsageError';
  }
}

type Command =
  | 'show'
  | 'import'
  | 'edit'
  | 'check'
  | 'approve'
  | 'hold'
  | 'cancel'
  | 'set-pr'
  | 'status';

type Flag = 'week' | 'file' | 'post' | 'pr';

const COMMANDS: Record<Command, { flags: Flag[]; required: Flag[] }> = {
  show: { flags: ['week'], required: [] },
  import: { flags: ['file'], required: ['file'] },
  edit: { flags: ['post', 'file'], required: ['post', 'file'] },
  check: { flags: ['file'], required: ['file'] },
  approve: { flags: ['post', 'week'], required: [] },
  hold: { flags: ['post'], required: ['post'] },
  cancel: { flags: ['post'], required: ['post'] },
  'set-pr': { flags: ['post', 'pr'], required: ['post', 'pr'] },
  status: { flags: [], required: [] },
};

const USAGE = `Usage: npx nx run marketing:week -- ${Object.keys(COMMANDS).join('|')} [--week YYYY-MM-DD] [--file <path>] [--post <id>] [--pr <number>]`;

interface ParsedArguments {
  command: Command;
  flags: Partial<Record<Flag, string>>;
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const command = argv[0];
  if (!command || !Object.hasOwn(COMMANDS, command)) {
    throw new WeekUsageError(USAGE);
  }
  const spec = COMMANDS[command as Command];
  const flags: Partial<Record<Flag, string>> = {};
  for (let index = 1; index < argv.length; index += 2) {
    const argument = argv[index];
    const value = argv[index + 1];
    const name = argument?.startsWith('--') ? argument.slice(2) : undefined;
    if (!name || !(spec.flags as string[]).includes(name)) {
      throw new WeekUsageError(`Unexpected argument "${argument}". ${USAGE}`);
    }
    if (!value || value.startsWith('--') || flags[name as Flag] !== undefined) {
      throw new WeekUsageError(`--${name} requires exactly one value`);
    }
    flags[name as Flag] = value;
  }
  for (const name of spec.required) {
    if (flags[name] === undefined)
      throw new WeekUsageError(`--${name} is required`);
  }
  if (flags.week !== undefined) {
    const monday =
      /^\d{4}-\d{2}-\d{2}$/.test(flags.week) &&
      new Date(`${flags.week}T00:00:00Z`).getUTCDay() === 1;
    if (!monday)
      throw new WeekUsageError('--week must be a Monday as YYYY-MM-DD');
  }
  return { command: command as Command, flags };
}

/**
 * The next Monday on or after today in America/New_York (today when it is a
 * Monday).
 */
export function defaultWeekStart(now: Date): string {
  const today = newYorkDate(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, (8 - weekday) % 7);
}

function describe(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
  }
  return error instanceof Error ? error.message : 'Week operation failed';
}

async function readJson(
  dependencies: WeekRunnerDependencies,
  path: string,
): Promise<unknown> {
  let text: string;
  try {
    text = await dependencies.readFile(path);
  } catch {
    throw new WeekUsageError(`Cannot read ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new WeekUsageError(`${path} is not valid JSON`);
  }
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

async function voiceIssuesOf(
  dependencies: WeekRunnerDependencies,
  post: {
    channel: QueuedPost['channel'];
    kind: PostKind;
    draft: QueueDraft;
    sources: Source[];
  },
): Promise<VoiceIssue[]> {
  let body: string | undefined;
  if (post.channel === 'blog') {
    const slug = (post.draft as BlogDraft).slug;
    if (typeof slug === 'string' && SLUG_RE.test(slug)) {
      body = await dependencies.operations.readBlogBody(slug);
    }
  }
  return checkVoice({ ...post, ...(body === undefined ? {} : { body }) });
}

const patchSchema = z.strictObject({
  draft: z.unknown().optional(),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  kind: z
    .enum(['release', 'qa', 'topical', 'guide', 'take', 'blog_promo', 'blog'])
    .optional(),
  sources: z.array(z.object({ url: z.url(), note: z.string() })).optional(),
});

function emit(dependencies: WeekRunnerDependencies, value: unknown): number {
  dependencies.writeOutput(JSON.stringify(value));
  return 0;
}

async function requirePost(
  dependencies: WeekRunnerDependencies,
  id: string,
): Promise<QueuedPost> {
  const post = await dependencies.operations.readPost(id);
  if (!post) throw new Error(`Post ${id} does not exist`);
  return post;
}

async function voiceIssuesByKey(
  dependencies: WeekRunnerDependencies,
  week: WeekImport,
): Promise<Record<string, VoiceIssue[]>> {
  const result: Record<string, VoiceIssue[]> = {};
  for (const post of week.posts) {
    result[post.key] = await voiceIssuesOf(dependencies, {
      channel: post.channel,
      kind: post.kind,
      draft: post.draft as QueueDraft,
      sources: post.sources,
    });
  }
  return result;
}

function required(flags: ParsedArguments['flags'], name: Flag): string {
  const value = flags[name];
  if (value === undefined) throw new WeekUsageError(`--${name} is required`);
  return value;
}

async function execute(
  { command, flags }: ParsedArguments,
  dependencies: WeekRunnerDependencies,
): Promise<number> {
  const { operations } = dependencies;
  const now = dependencies.now();

  switch (command) {
    case 'show': {
      const weekStart = flags.week ?? defaultWeekStart(now);
      const found = await operations.readWeek(weekStart);
      if (!found) throw new Error(`No week imported for ${weekStart}`);
      const posts = [];
      for (const post of found.posts) {
        posts.push({
          ...post,
          voiceIssues: await voiceIssuesOf(dependencies, post),
        });
      }
      return emit(dependencies, { week: found.week, posts });
    }

    case 'check': {
      const week = WeekImport.parse(
        await readJson(dependencies, required(flags, 'file')),
      );
      return emit(dependencies, {
        weekStart: week.weekStart,
        voiceIssues: await voiceIssuesByKey(dependencies, week),
      });
    }

    case 'import': {
      const week = WeekImport.parse(
        await readJson(dependencies, required(flags, 'file')),
      );
      const { weekId, postIds } = await operations.importWeek(week);
      return emit(dependencies, {
        weekId,
        postIds,
        voiceIssues: await voiceIssuesByKey(dependencies, week),
      });
    }

    case 'edit': {
      const id = required(flags, 'post');
      const patch = patchSchema.parse(
        await readJson(dependencies, required(flags, 'file')),
      );
      const current = await requirePost(dependencies, id);
      if (patch.draft !== undefined) {
        const channel = (patch.draft as { channel?: unknown } | null)?.channel;
        if (channel !== current.channel) {
          throw new Error(
            `The draft's channel "${String(channel)}" does not match the post's channel "${current.channel}"`,
          );
        }
        draftSchemas[current.channel].parse(patch.draft);
      }
      await operations.updatePostDraft(id, {
        ...(patch.draft === undefined
          ? {}
          : { draft: patch.draft as QueueDraft }),
        ...(patch.scheduledAt === undefined
          ? {}
          : { scheduledAt: new Date(patch.scheduledAt) }),
        ...(patch.kind === undefined ? {} : { kind: patch.kind }),
        ...(patch.sources === undefined ? {} : { sources: patch.sources }),
      });
      const post = await requirePost(dependencies, id);
      return emit(dependencies, {
        post,
        voiceIssues: await voiceIssuesOf(dependencies, post),
      });
    }

    case 'approve': {
      if (flags.post !== undefined) {
        const post = await requirePost(dependencies, flags.post);
        assertApprovable(post.channel, post.draft);
        const approved = await operations.approvePosts(post.weekId, post.id);
        return emit(dependencies, { approved });
      }
      const weekStart = flags.week ?? defaultWeekStart(now);
      const found = await operations.readWeek(weekStart);
      if (!found) throw new Error(`No week imported for ${weekStart}`);
      // Validate every eligible row before approving any of the week.
      for (const post of found.posts.filter(
        (post) => post.status === 'draft',
      )) {
        assertApprovable(post.channel, post.draft);
      }
      const approved = await operations.approvePosts(found.week.id, undefined);
      return emit(dependencies, { approved });
    }

    case 'hold':
    case 'cancel': {
      const status = command === 'hold' ? 'held' : 'cancelled';
      await operations.setPostStatus(required(flags, 'post'), status);
      return emit(dependencies, { id: flags.post, status });
    }

    case 'set-pr': {
      const prNumber = Number(flags.pr);
      if (!Number.isInteger(prNumber) || prNumber <= 0) {
        throw new WeekUsageError('--pr must be a positive integer');
      }
      await operations.updateBlogDraft(required(flags, 'post'), { prNumber });
      return emit(dependencies, { id: flags.post, prNumber });
    }

    case 'status': {
      const lastWeekStart = addDays(defaultWeekStart(now), -7);
      const last = await operations.readWeek(lastWeekStart);
      const byStatus: Record<string, QueuedPost[]> = {};
      for (const post of last?.posts ?? []) {
        (byStatus[post.status] ??= []).push(post);
      }
      // Failed and held posts, then the last two weeks' posts that went live
      // with a follow-up step left to do by hand (lastError says what).
      const attention = [
        ...(await operations.listPostsByStatus(['failed', 'held'])),
        ...(await operations.listPublishedWithWarnings(
          new Date(now.getTime() - WARNING_LOOKBACK_DAYS * DAY_MS),
        )),
      ].map((post) => ({
        id: post.id,
        channel: post.channel,
        kind: post.kind,
        status: post.status,
        scheduledAt: post.scheduledAt,
        externalUrl: post.externalUrl,
        lastError: post.lastError,
      }));
      const credentials = operations.expiringWithin
        ? await operations.expiringWithin(now, 14)
        : 'unavailable: MARKETING_CREDENTIALS_KEY not set';
      return emit(dependencies, {
        lastWeek: last ? { weekStart: lastWeekStart, byStatus } : null,
        attention,
        credentials,
      });
    }
  }
}

/** Runs one command, returning its process exit status. */
export async function runWeek(
  argv: readonly string[],
  dependencies: WeekRunnerDependencies,
): Promise<number> {
  try {
    return await execute(parseArguments(argv), dependencies);
  } catch (error) {
    dependencies.writeError(JSON.stringify({ error: describe(error) }));
    return 1;
  }
}

/** Operations bound to a database executor and, optionally, the credentials key. */
export function createWeekOperations(
  executor: SqlExecutor,
  options: { credentialsKey?: string; blogDirectory?: string } = {},
): WeekOperations {
  const blogDirectory =
    options.blogDirectory ?? resolve(repoRoot, 'www/content/blog');
  const credentials = options.credentialsKey
    ? createCredentialStore(executor, options.credentialsKey)
    : undefined;
  return {
    readWeek: (weekStart) => readWeek(executor, weekStart),
    readPost: (id) => readPost(executor, id),
    importWeek: (week) => importWeek(executor, week),
    updatePostDraft: (id, patch) => updatePostDraft(executor, id, patch),
    approvePosts: (weekId, postId) => approvePosts(executor, weekId, postId),
    setPostStatus: (id, status) => setPostStatus(executor, id, status),
    updateBlogDraft: (id, patch) => updateBlogDraft(executor, id, patch),
    listPostsByStatus: (statuses) => listPostsByStatus(executor, statuses),
    listPublishedWithWarnings: (since) =>
      listPublishedWithWarnings(executor, since),
    expiringWithin: credentials
      ? (now, days) => credentials.expiringWithin(now, days)
      : undefined,
    readBlogBody: (slug) => readBlogFile(blogDirectory, slug),
  };
}

async function readBlogFile(
  directory: string,
  slug: string,
): Promise<string | undefined> {
  try {
    return await readFile(resolve(directory, `${slug}.md`), 'utf8');
  } catch {
    return undefined;
  }
}

/** Collaborators of {@link mainWeek}. */
export interface WeekMainDependencies {
  /** Validates the environment and opens the database. */
  createOperations(): { operations: WeekOperations; close?(): Promise<void> };
  readBlogBody(slug: string): Promise<string | undefined>;
  readFile(path: string): Promise<string>;
  now(): Date;
  writeOutput(line: string): void;
  writeError(line: string): void;
}

const DEFAULT_MAIN_DEPENDENCIES: WeekMainDependencies = {
  createOperations: () => {
    validateGrowthDatabaseEnvironment({
      mode: 'migration',
      environment: process.env,
      nodeVersion: process.versions.node,
    });
    const executor = createDatabaseExecutor();
    return {
      operations: createWeekOperations(executor, {
        credentialsKey:
          process.env['MARKETING_CREDENTIALS_KEY']?.trim() || undefined,
      }),
      close: () => executor.close?.() ?? Promise.resolve(),
    };
  },
  readBlogBody: (slug) =>
    readBlogFile(resolve(repoRoot, 'www/content/blog'), slug),
  readFile: (path) => readFile(path, 'utf8'),
  now: () => new Date(),
  writeOutput: (line) => process.stdout.write(`${line}\n`),
  writeError: (line) => process.stderr.write(`${line}\n`),
};

function offlineOperations(
  readBlogBody: WeekOperations['readBlogBody'],
): WeekOperations {
  const unavailable = () => {
    throw new Error('This command needs the database');
  };
  return {
    readWeek: unavailable,
    readPost: unavailable,
    importWeek: unavailable,
    updatePostDraft: unavailable,
    approvePosts: unavailable,
    setPostStatus: unavailable,
    updateBlogDraft: unavailable,
    listPostsByStatus: unavailable,
    listPublishedWithWarnings: unavailable,
    readBlogBody,
  };
}

/**
 * Validates the command, then opens the database (except for `check`, which
 * never touches it) and closes it when done.
 */
export async function mainWeek(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: WeekMainDependencies = DEFAULT_MAIN_DEPENDENCIES,
): Promise<number> {
  const fail = (error: unknown): number => {
    dependencies.writeError(JSON.stringify({ error: describe(error) }));
    return 1;
  };

  let parsed: ParsedArguments;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    return fail(error);
  }

  const runner = (operations: WeekOperations) =>
    runWeek(argv, {
      operations,
      now: dependencies.now,
      readFile: dependencies.readFile,
      writeOutput: dependencies.writeOutput,
      writeError: dependencies.writeError,
    });

  if (parsed.command === 'check') {
    return runner(offlineOperations(dependencies.readBlogBody));
  }

  let database: ReturnType<WeekMainDependencies['createOperations']>;
  try {
    database = dependencies.createOperations();
  } catch (error) {
    return fail(error);
  }
  try {
    return await runner(database.operations);
  } finally {
    await database.close?.();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  void mainWeek().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    () => {
      process.stderr.write('{"error":"Week operation failed"}\n');
      process.exitCode = 1;
    },
  );
}
