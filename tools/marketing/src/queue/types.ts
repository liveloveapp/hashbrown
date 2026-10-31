import type { Draft } from '../channels/types.ts';

/** The channels a queued post publishes to. */
export type MarketingChannel = 'x' | 'linkedin' | 'blog' | 'devto';

/** What a post is for; the week plan balances these. */
export type PostKind =
  'release' | 'qa' | 'topical' | 'guide' | 'take' | 'blog_promo' | 'blog';

/** Where a post sits between drafting and going live. */
export type PostStatus =
  | 'draft'
  | 'approved'
  | 'held'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled';

/** A source that backs a claim in a post. */
export interface Source {
  url: string;
  note: string;
}

/**
 * A blog post that ships as a pull request on the site repo. Brian merges it;
 * its `publishAt` frontmatter keeps it hidden until `scheduledAt`.
 */
export interface BlogDraft {
  channel: 'blog';
  slug: string;
  title: string;
  /** The post's PR, for the weekly report. The dispatcher never touches it. */
  prNumber?: number;
}

/** A dev.to cross-post of a blog post, published after the blog is live. */
export interface DevtoDraft {
  channel: 'devto';
  blogSlug: string;
  article: { title: string; tags: string[]; description: string };
}

/** Any draft the queue stores; `channel` discriminates it. */
export type QueueDraft = Draft | BlogDraft | DevtoDraft;

/** A row of `marketing_posts`. */
export interface QueuedPost {
  id: string;
  weekId: string;
  channel: MarketingChannel;
  kind: PostKind;
  scheduledAt: Date;
  draft: QueueDraft;
  sources: Source[];
  dependsOn: string | null;
  status: PostStatus;
  attempts: number;
  externalId: string | null;
  externalUrl: string | null;
  publishedAt: Date | null;
  lastError: string | null;
}

/** A row of `marketing_weeks`. */
export interface QueuedWeek {
  id: string;
  /** `YYYY-MM-DD`, always a Monday. */
  weekStart: string;
  status: 'draft' | 'approved' | 'done';
  researchBrief: Record<string, unknown>;
  approvedAt: Date | null;
}
