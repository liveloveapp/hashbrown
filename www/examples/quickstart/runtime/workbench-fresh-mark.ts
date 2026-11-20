import type { WorkbenchFresh } from './workbench-fresh';

/** Drops the `ui.N.Component.props.` prefix a streamed UI document puts before a card field. */
function cardPath(path: string): string {
  return path.replace(/^ui\.\d+\.[^.]+\.props\./, '');
}

/**
 * Marks the element for `fresh.path` in the newest `.wb-summary` card in
 * `feed` with `data-wb-fresh`, and clears it everywhere else.
 *
 * The attribute is `""` while text streams and `"settle"` when the mark is
 * fading out on a completed frame.
 *
 * @param feed - The chat feed holding plan cards.
 * @param fresh - The newest streamed text, or `null` to clear every mark.
 * @param options - Pass `settle: true` to write the settle value.
 */
export function markWorkbenchFresh(
  feed: HTMLElement,
  fresh: WorkbenchFresh | null,
  options: { readonly settle?: boolean } = {},
): void {
  const cards = feed.querySelectorAll('.wb-summary');
  const newest = cards[cards.length - 1];
  const target =
    fresh && newest
      ? ([...newest.querySelectorAll<HTMLElement>('[data-wb-path]')].find(
          (node) => node.dataset['wbPath'] === cardPath(fresh.path),
        ) ?? null)
      : null;
  const value = options.settle ? 'settle' : '';
  feed.querySelectorAll<HTMLElement>('[data-wb-fresh]').forEach((node) => {
    if (node !== target) node.removeAttribute('data-wb-fresh');
  });
  if (target && target.getAttribute('data-wb-fresh') !== value)
    target.setAttribute('data-wb-fresh', value);
}
