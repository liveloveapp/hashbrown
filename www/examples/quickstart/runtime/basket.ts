import { s } from '@hashbrownai/core';

/** Describes the model-facing input; the handler still validates it. */
export const basketArgs = s.object('Read the USD basket', {
  currency: s.literal('USD'),
});

/** Describes the basket snapshot returned to the script. */
export const basketResult = s.object('A read-only basket snapshot', {
  currency: s.literal('USD'),
  items: s.array(
    'Basket items',
    s.object('An item', {
      name: s.string('Product name'),
      priceCents: s.number('Integer price in cents'),
    }),
  ),
});

/** Reads a fresh basket snapshot after explicitly validating untrusted arguments. */
export function readBasket(input: unknown): s.Infer<typeof basketResult> {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).length !== 1 ||
    !('currency' in input) ||
    input.currency !== 'USD'
  ) {
    throw new TypeError('Expected exactly { currency: "USD" }.');
  }

  return {
    currency: 'USD',
    items: [
      { name: 'Coffee', priceCents: 1800 },
      { name: 'Tea', priceCents: 1400 },
      { name: 'Chocolate', priceCents: 1000 },
    ],
  };
}

/** Scripts used by both framework examples; host calls appear synchronous in QuickJS. */
export const runtimeScripts = {
  calculate: `const basket = readBasket({ currency: 'USD' });
({
  currency: basket.currency,
  itemCount: basket.items.length,
  totalCents: basket.items.reduce((total, item) => total + item.priceCents, 0),
});`,
  browser: 'document.title;',
  invalid: "readBasket({ currency: 'EUR' });",
};
