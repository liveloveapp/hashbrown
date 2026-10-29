/** How a docs page embeds the workbench: a recorded replay or a live run. */
export type WorkbenchEmbedMode = 'replay' | 'live' | null;

/**
 * Reads the `embed` query parameter.
 *
 * @param search - A location search string such as `?embed=replay`.
 * @returns `replay` or `live`; any other value gives `null`.
 */
export function getWorkbenchEmbedMode(search: string): WorkbenchEmbedMode {
  const value = new URLSearchParams(search).get('embed');
  return value === 'replay' || value === 'live' ? value : null;
}
