/**
 * Reference pages keyed by SDK-independent slug, with the reason they present
 * evidence directly instead of a recorded demo or interactive workbench lesson.
 * Only explicitly listed pages receive the reference presentation policy.
 */
export const DOCS_REFERENCE_PAGES: Readonly<Record<string, string>> = {
  'platform/compatibility':
    'versioned evidence reference; no recorded demo or workbench lesson represents the matrix',
};

/**
 * Docs pages that show no workbench lesson, keyed by slug path without the SDK
 * (for example `'migrations/v0-8'`), with the reason. Every other docs page
 * shows exactly one lesson: an `hb-workbench` panel when the lesson is its
 * subject, or an `hb-workbench-launcher` in its "Explore it in the workbench"
 * section when it is only related. A test holds every page to that rule, so a
 * new page has to choose.
 */
export const WORKBENCH_FREE_PAGES: Readonly<Record<string, string>> = {
  ...DOCS_REFERENCE_PAGES,
  'migrations/threadplane': 'threadplane has its own video, not a lesson',
  'migrations/v0-5': 'a migration guide; its video shows the current flow',
  'migrations/v0-6': 'a migration guide; its video shows the current flow',
  'migrations/v0-7': 'a migration guide; its video shows the current flow',
  'migrations/v0-8': 'a migration guide; its video shows the current flow',
  'recipes/threadplane': 'threadplane has its own video, not a lesson',
  'start/sample': 'the atc sample links several lessons, none is its subject',
};
