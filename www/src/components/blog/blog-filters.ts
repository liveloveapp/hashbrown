/** A blog index filter: the button label and the tag it matches (`''` for all). */
export interface BlogFilter {
  text: string;
  query: string;
}

/** The fields the filters read from a post. */
export interface FilterablePost {
  /** ISO date, `yyyy-mm-dd`. */
  date: string;
  tags: string[];
}

/** The blog index filters, in button order (from `blog/index.page.ts`). */
export const BLOG_FILTERS: readonly BlogFilter[] = [
  { text: 'All blogs', query: '' },
  { text: 'Stories', query: 'story' },
  { text: 'Talks', query: 'talk' },
  { text: 'Releases', query: 'release' },
];

/**
 * Keep the posts tagged with the filter's query (every post when the query is
 * empty), newest first. Returns a new array; the input is left untouched.
 *
 * @param posts - Posts to filter.
 * @param filter - The selected filter.
 */
export function filterPosts<T extends FilterablePost>(
  posts: readonly T[],
  filter: BlogFilter,
): T[] {
  const filtered = filter.query
    ? posts.filter((post) => post.tags.includes(filter.query))
    : posts;
  return [...filtered].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * The filter selected after a click: clicking the selected filter goes back
 * to the first ("All blogs") filter, as on the Angular site.
 *
 * @param selected - The currently selected filter.
 * @param clicked - The filter that was clicked.
 * @param filters - The available filters; the first one is "all".
 */
export function toggleFilter(
  selected: BlogFilter,
  clicked: BlogFilter,
  filters: readonly BlogFilter[] = BLOG_FILTERS,
): BlogFilter {
  return selected === clicked ? filters[0] : clicked;
}
