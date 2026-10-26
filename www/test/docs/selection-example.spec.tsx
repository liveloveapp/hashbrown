import { createSelectionSchema, ɵcompileDecision } from '@hashbrownai/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import {
  selectionItems,
  selectionOptions,
  selectionSchema,
} from '../../examples/quickstart/runtime/selection';
import {
  ItemList,
  selectionCandidates,
  SummaryCard,
} from '../../examples/quickstart/react/src/UiSelection';

test('the server schema pins the same ordered questions as rendered candidates', () => {
  const clientSchema = createSelectionSchema(selectionCandidates, 'one');

  const questions = ɵcompileDecision(clientSchema);

  expect(questions).toEqual(ɵcompileDecision(selectionSchema));
  expect(selectionOptions.map(({ id }) => id)).toEqual(['summary', 'items']);
  expect(JSON.stringify(questions)).not.toContain('Apples');
  expect(JSON.stringify(questions)).not.toContain('"quantity":');
});

test('the summary counts product rows separately from quantities', () => {
  const items = selectionItems;

  const html = renderToStaticMarkup(<SummaryCard items={items} />);

  expect(html).toContain('2 products');
  expect(html).toContain('3 total items');
  expect(items).toEqual([
    { name: 'Apples', quantity: 2 },
    { name: 'Bread', quantity: 1 },
  ]);
});

test('the item list renders app-owned names and quantities as plain text', () => {
  const items = [{ name: '<script>changed</script>', quantity: 4 }];

  const html = renderToStaticMarkup(<ItemList items={items} />);

  expect(html).toContain('&lt;script&gt;changed&lt;/script&gt;');
  expect(html).toContain('4');
  expect(html).not.toContain('<script>');
  expect(items).toEqual([{ name: '<script>changed</script>', quantity: 4 }]);
});
