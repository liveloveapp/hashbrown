import type { ExposedComponentDescriptor } from '../ui/expose-component';
import { createUiKit } from '../ui/ui-kit';
import * as publicApi from '../public_api';
import { createComponentSelection } from './component-selection';

function component(
  name: string,
  children?: ExposedComponentDescriptor['children'],
): ExposedComponentDescriptor {
  return {
    component: { name },
    name,
    description: `The ${name} component`,
    ...(children === undefined ? {} : { children }),
  };
}

const flight = component('Flight');
const airport = component('Airport');
const row = component('Row');
const cell = component('Cell', 'text');
const table = component('Table', [row]);
const nestedRow = component('NestedRow', [cell]);
const grid = component('Grid', [nestedRow]);

function names(entries: ReadonlyArray<{ name: string }>): string[] {
  return entries.map((entry) => entry.name);
}

test('createComponentSelection flattens kits into their members', () => {
  const kit = createUiKit({ components: [flight, airport] });

  const selection = createComponentSelection([kit]);

  expect(selection.options).toEqual([
    { id: 'Flight', description: 'The Flight component' },
    { id: 'Airport', description: 'The Airport component' },
  ]);
});

test('createComponentSelection dedupes components by name', () => {
  const kit = createUiKit({ components: [flight, airport] });

  const selection = createComponentSelection([airport, kit, flight]);

  expect(selection.options.map((option) => option.id)).toEqual([
    'Airport',
    'Flight',
  ]);
});

test('createComponentSelection includes declared children as options', () => {
  const selection = createComponentSelection([grid, flight]);

  expect(selection.options.map((option) => option.id)).toEqual([
    'Grid',
    'NestedRow',
    'Cell',
    'Flight',
  ]);
});

test('createComponentSelection expands chosen parents with their children', () => {
  const kit = createUiKit({ components: [flight, table] });

  const selection = createComponentSelection([kit]);

  expect(names(selection.expand(['Table']))).toEqual(['Table', 'Row']);
});

test('createComponentSelection expands children recursively', () => {
  const selection = createComponentSelection([flight, grid]);

  const expanded = selection.expand(['Grid']);

  expect(names(expanded)).toEqual(['Grid', 'NestedRow', 'Cell']);
  expect(expanded[0]).toBe(grid);
});

test('createComponentSelection expands in declared order, not chosen order', () => {
  const kit = createUiKit({ components: [flight, airport, table] });

  const selection = createComponentSelection([kit]);

  expect(names(selection.expand(['Table', 'Flight']))).toEqual([
    'Flight',
    'Table',
    'Row',
  ]);
});

test('createComponentSelection mixes plain components and kits', () => {
  const kit = createUiKit({ components: [table] });

  const selection = createComponentSelection([flight, kit, airport]);

  expect(selection.options.map((option) => option.id)).toEqual([
    'Flight',
    'Table',
    'Row',
    'Airport',
  ]);
  expect(names(selection.expand(['Airport', 'Row']))).toEqual([
    'Row',
    'Airport',
  ]);
});

test('createComponentSelection ignores unknown ids', () => {
  const selection = createComponentSelection([flight]);

  const expanded = selection.expand(['Nope']);

  expect(expanded).toEqual([]);
});

test('createComponentSelection with no components has no options', () => {
  const selection = createComponentSelection([]);

  expect(selection.options).toEqual([]);
  expect(selection.expand([])).toEqual([]);
});

test('createComponentSelection recurses into the children of a duplicate name like createUiKit', () => {
  const plainTable = component('Table');
  const tableWithRows = component('Table', [row]);
  const components = [plainTable, tableWithRows];
  const kit = createUiKit({
    components: [
      { ...plainTable, component: tableWithRows.component },
      tableWithRows,
    ],
  });

  const selection = createComponentSelection(components);

  expect(selection.options.map((option) => option.id)).toEqual([
    'Table',
    'Row',
  ]);
  expect(names(kit.components)).toEqual(['Table', 'Row']);
  expect(names(selection.expand(['Table']))).toEqual(['Table', 'Row']);
});

test('createComponentSelection handles a component that is its own descendant', () => {
  const tree: ExposedComponentDescriptor = {
    component: { name: 'Tree' },
    name: 'Tree',
    description: 'A tree',
    children: [],
  };
  const branch = component('Branch', [tree]);
  (tree.children as unknown[]).push(branch);

  const selection = createComponentSelection([tree]);

  expect(selection.options.map((option) => option.id)).toEqual([
    'Tree',
    'Branch',
  ]);
  expect(names(selection.expand(['Branch']))).toEqual(['Tree', 'Branch']);
});

test('createComponentSelection is ɵ', () => {
  const api = publicApi as Record<string, unknown>;

  const exported = api['ɵcreateComponentSelection'];

  expect(exported).toBe(createComponentSelection);
  expect(api['createComponentSelection']).toBeUndefined();
});

function optionIds(selection: { options: Array<{ id: string }> }): string[] {
  return selection.options.map((option) => option.id);
}

test('options skip non-selectable kit members', () => {
  const kit = createUiKit({ components: [airport, row], selectable: false });

  const selection = createComponentSelection([flight, kit]);

  expect(optionIds(selection)).toEqual(['Flight']);
});

test('expand always includes non-selectable members in declared order', () => {
  const kit = createUiKit({ components: [airport], selectable: false });
  const holder = component('Holder', [airport]);

  const selection = createComponentSelection([flight, kit, holder]);
  const expanded = selection.expand(['Holder', 'Flight']);

  expect(optionIds(selection)).toEqual(['Flight', 'Holder']);
  expect(names(expanded)).toEqual(['Flight', 'Airport', 'Holder']);
});

test('a name in both a selectable and a non-selectable kit is non-selectable', () => {
  const open = createUiKit({ components: [flight, airport] });
  const hidden = createUiKit({ components: [airport], selectable: false });

  const selection = createComponentSelection([open, hidden]);

  expect(optionIds(selection)).toEqual(['Flight']);
  expect(names(selection.expand(['Airport']))).toEqual(['Airport']);
});
