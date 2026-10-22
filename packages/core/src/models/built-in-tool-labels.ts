/**
 * The shared wording for the labels of built-in provider tools, such as web
 * search. Provider adapters use it so every provider says the same thing.
 */

const LABEL_MAX = 120;

/**
 * Builds the label for a built-in tool call at a given stage.
 *
 * For `web_search` the label reads `Searching the web for '<query>'` while
 * running, `Searched '<query>' · <n> sources` once completed, and
 * `Web search failed` on failure. Any other builtin reads `Using <builtin>`,
 * `Used <builtin>` or `<builtin> failed`. The result is cut to 120 code
 * points.
 *
 * @param builtin - The built-in tool name, such as `web_search`.
 * @param status - Whether the call is running, completed or failed.
 * @param detail - The search query and the number of sources, when known.
 * @returns The label.
 */
export function ɵbuiltInToolLabel(
  builtin: string,
  status: 'running' | 'completed' | 'failed',
  detail: { query?: string; sourceCount?: number },
): string {
  return Array.from(label(builtin, status, detail))
    .slice(0, LABEL_MAX)
    .join('');
}

function label(
  builtin: string,
  status: 'running' | 'completed' | 'failed',
  { query, sourceCount }: { query?: string; sourceCount?: number },
): string {
  if (builtin === 'web_search') {
    if (status === 'failed') return 'Web search failed';
    if (status === 'running') {
      return query === undefined
        ? 'Searching the web'
        : `Searching the web for '${query}'`;
    }
    const subject =
      query === undefined ? 'Searched the web' : `Searched '${query}'`;
    if (sourceCount === undefined) return subject;
    return `${subject} · ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`;
  }
  if (status === 'running') return `Using ${builtin}`;
  if (status === 'completed') return `Used ${builtin}`;
  return `${builtin} failed`;
}
