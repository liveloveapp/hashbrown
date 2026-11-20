import { workbenchCardPath, type WorkbenchFresh } from './workbench-fresh';

function fieldElement(card: Element | undefined, path: string) {
  if (!card) return null;
  if (path === 'title') return card.querySelector<HTMLElement>('h2');
  const match = /^steps\.(\d+)$/.exec(path);
  return match
    ? (card.querySelectorAll<HTMLElement>('ol > li')[Number(match[1])] ?? null)
    : null;
}

/**
 * Marks the element for `fresh.path` in the newest `.wb-summary` card in
 * `feed` with `data-wb-fresh`, and clears it everywhere else.
 *
 * The title is the card's `h2` and `steps.N` is its Nth `ol > li`. The
 * attribute is `""` while text streams and `"settle"` when the mark is fading
 * out on a completed frame.
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
  const target = fresh
    ? fieldElement(cards[cards.length - 1], workbenchCardPath(fresh.path))
    : null;
  const value = options.settle ? 'settle' : '';
  feed.querySelectorAll<HTMLElement>('[data-wb-fresh]').forEach((node) => {
    if (node !== target) node.removeAttribute('data-wb-fresh');
  });
  if (target && target.getAttribute('data-wb-fresh') !== value)
    target.setAttribute('data-wb-fresh', value);
}
