import type { ExposedComponentDescriptor } from './expose-component';
import { mergeOfferedComponents } from './offered-components';
import { createUiKit } from './ui-kit';

function component(
  name: string,
  implementation: object = { name },
  children?: ExposedComponentDescriptor['children'],
): ExposedComponentDescriptor {
  return {
    component: implementation,
    name,
    description: `The ${name} component`,
    ...(children === undefined ? {} : { children }),
  };
}

function names(entries: ReadonlyArray<{ name: string }>): string[] {
  return entries.map((entry) => entry.name);
}

test('mergeOfferedComponents flattens kits and declared children by name', () => {
  const row = component('Row');
  const table = component('Table', {}, [row]);
  const kit = createUiKit({ components: [table] });

  const offered = mergeOfferedComponents([kit, component('Note')], []);

  expect(names(offered)).toEqual(['Table', 'Row', 'Note']);
});

test('mergeOfferedComponents keeps older components the newest list dropped', () => {
  const card = component('Card');
  const note = component('Note');

  const offered = mergeOfferedComponents([note], [card, note]);

  expect(offered).toEqual([note, card]);
});

test('mergeOfferedComponents replaces an older component with the same name', () => {
  const card = component('Card', { version: 1 });
  const cardV2 = component('Card', { version: 2 });

  const offered = mergeOfferedComponents([cardV2], [card]);

  expect(offered).toEqual([cardV2]);
  expect(() => createUiKit({ components: offered })).not.toThrow();
});

test('mergeOfferedComponents points older parents at the newest children', () => {
  const row = component('Row', { version: 1 });
  const rowV2 = component('Row', { version: 2 });
  const table = component('Table', {}, [row]);

  const offered = mergeOfferedComponents([rowV2], [table, row]);

  expect(names(offered)).toEqual(['Row', 'Table']);
  expect(offered[1].children).toEqual([rowV2]);
  expect(() => createUiKit({ components: offered })).not.toThrow();
});

test('mergeOfferedComponents stays bounded when the same names are offered again', () => {
  const card = component('Card');
  const note = component('Note');
  let offered = mergeOfferedComponents([card, note], []);

  for (let i = 0; i < 5; i++) {
    offered = mergeOfferedComponents([card], offered);
    offered = mergeOfferedComponents([card, note], offered);
  }

  expect(names(offered)).toEqual(['Card', 'Note']);
});

test('mergeOfferedComponents returns the previous list when nothing changed', () => {
  const card = component('Card');
  const previous = mergeOfferedComponents([card], []);

  const offered = mergeOfferedComponents([card], previous);

  expect(offered).toBe(previous);
});
