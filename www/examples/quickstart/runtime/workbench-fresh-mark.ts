import { workbenchCardPath, type WorkbenchFresh } from './workbench-fresh';

function fieldElement(card: Element | undefined, path: string) {
  if (!card) return null;
  if (path === 'title') return card.querySelector<HTMLElement>('h2');
  const match = /^steps\.(\d+)$/.exec(path);
  return match
    ? (card.querySelectorAll<HTMLElement>('ol > li')[Number(match[1])] ?? null)
    : null;
}

function newestTurnCard(feed: HTMLElement): Element | undefined {
  const users = feed.querySelectorAll('.wb-user');
  const user = users[users.length - 1];
  const cards = [...feed.querySelectorAll('.wb-summary')].filter(
    (card) =>
      !user ||
      (user.compareDocumentPosition(card) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
  );
  return cards[cards.length - 1];
}

/**
 * Marks the element for `fresh.path` in the newest `.wb-summary` card in
 * `feed` with `data-wb-fresh`, and clears it everywhere else.
 *
 * Only a card after the newest `.wb-user` message counts, so while a new
 * turn's card has not mounted yet nothing is marked rather than the previous
 * turn's card.
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
  const target = fresh
    ? fieldElement(newestTurnCard(feed), workbenchCardPath(fresh.path))
    : null;
  const value = options.settle ? 'settle' : '';
  feed.querySelectorAll<HTMLElement>('[data-wb-fresh]').forEach((node) => {
    if (node !== target) node.removeAttribute('data-wb-fresh');
  });
  if (target && target.getAttribute('data-wb-fresh') !== value)
    target.setAttribute('data-wb-fresh', value);
}
