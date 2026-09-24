/**
 * Return the newest blog posts, each with a `date` parsed from its
 * `YYYY-MM-DD` slug prefix. The input is left untouched.
 *
 * @param posts - Blog posts, in any order.
 * @param count - How many posts to return.
 */
export function selectLatestPosts<T extends { slug: string }>(
  posts: readonly T[],
  count: number,
): Array<T & { date: Date }> {
  return posts
    .map((post) => ({ ...post, date: new Date(post.slug.slice(0, 10)) }))
    .sort((a, b) => (b.date.getTime() || 0) - (a.date.getTime() || 0))
    .slice(0, count);
}

const MEDIUM_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Format a post date like Angular's `date: 'mediumDate' : 'UTC'` pipe
 * (without the time), e.g. `Jul 9, 2026`.
 *
 * @param date - The date to format.
 */
export function formatPostDate(date: Date): string {
  return MEDIUM_DATE.format(date);
}
