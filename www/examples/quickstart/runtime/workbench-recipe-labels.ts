import type { WorkbenchSnapshot } from './workbench';

/** Names recipe observations and explicit interactions without inventing JSON streams or application writes. */
export function workbenchRecipeEventLabel(
  event: WorkbenchSnapshot['events'][number],
): string | undefined {
  if (event.kind === 'dismiss') return 'Suggestion dismissed';
  if (event.kind === 'parsed') {
    if (event.recipe?.kind === 'text') return 'Parsed text';
    if (event.recipe?.kind === 'predictions') return 'Suggestions ready';
    if (event.recipe?.kind === 'selection') return 'Selection result';
  }
  const payload = event.payload;
  if (event.kind !== 'choose' || !payload || typeof payload !== 'object')
    return undefined;
  if ('citation' in payload) return 'Reference selected';
  if ('actionId' in payload) return 'Suggestion accepted';
  if ('selectedView' in payload)
    return 'manual' in payload && payload.manual
      ? 'Manual view'
      : 'View applied';
  return undefined;
}
