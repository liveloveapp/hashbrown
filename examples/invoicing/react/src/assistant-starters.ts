/** The questions an empty conversation offers when nothing is selected. */
export const STARTERS = [
  'How much cash is still unapplied?',
  'Which clients pay late?',
  'How did invoicing trend over the last 6 months?',
] as const;

/** The first starter while a payment is selected. */
export const SELECTED_STARTER = 'Which invoices does this payment cover?';

/**
 * The starter questions for the current selection: a selected payment wins,
 * then a focused client; otherwise the general three. Kept outside the
 * assistant chunk so the rail can show them before the assistant loads.
 */
export function startersFor(selection: {
  readonly selectedPaymentId?: string;
  readonly focusedClientName?: string;
}): readonly string[] {
  if (selection.selectedPaymentId)
    return [SELECTED_STARTER, ...STARTERS.slice(0, 2)];
  if (selection.focusedClientName)
    return [
      `What does ${selection.focusedClientName} owe, and how late is it?`,
      ...STARTERS.slice(0, 2),
    ];
  return STARTERS;
}
