import type { ExposedComponentDescriptor } from '../ui/expose-component';
import { createUiKit } from '../ui/ui-kit';
import * as publicApi from '../public_api';
import { compileDecision } from './compile-decision';
import {
  componentSelectionOptions,
  createComponentSelection,
} from './component-selection';
import { createSelectionSchema } from './ui-selection';

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

test('componentSelectionOptions matches the options the hooks decide over', () => {
  const kit = createUiKit({ components: [table, airport] });
  const components = [flight, kit, grid];

  const pinned = compileDecision(
    createSelectionSchema(componentSelectionOptions(components), 'one'),
  );
  const sent = compileDecision(
    createSelectionSchema(createComponentSelection(components).options, 'one'),
  );

  expect(pinned).toEqual(sent);
  expect(JSON.stringify(pinned)).toBe(JSON.stringify(sent));
});

test('componentSelectionOptions accepts definitions without implementations', () => {
  const definitions = [
    {
      name: 'Table',
      description: 'A table',
      children: [{ name: 'Row', description: 'A row' }],
    },
    { name: 'Flight', description: 'One aircraft' },
  ];

  const options = componentSelectionOptions(definitions);

  expect(options).toEqual([
    { id: 'Table', description: 'A table' },
    { id: 'Row', description: 'A row' },
    { id: 'Flight', description: 'One aircraft' },
  ]);
});

test('componentSelectionOptions is public and createComponentSelection is ɵ', () => {
  const api = publicApi as Record<string, unknown>;

  expect(api['componentSelectionOptions']).toBe(componentSelectionOptions);
  expect(api['ɵcreateComponentSelection']).toBe(createComponentSelection);
  expect(api['createComponentSelection']).toBeUndefined();
});
