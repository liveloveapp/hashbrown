/** Types for `due-blog-posts.mjs`, which stays plain JavaScript so CI runs it without `npm ci`. */

export interface PostSchedule {
  slug: string;
  published: boolean;
  publishAt: Date;
}

export const LOOKBACK_MS: number;
export const SITE_URL: string;

export function readSchedule(file: string, text: string): PostSchedule;

export function recentlyDue(posts: PostSchedule[], now: Date): PostSchedule[];

export function needsRedeploy(
  posts: PostSchedule[],
  now: Date,
  fetchImpl?: typeof fetch,
): Promise<boolean>;
