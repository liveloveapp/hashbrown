import { compileDecision } from './compile-decision';
import { decodeDecision } from './decode-decision';
import type { DecidableSchema } from './decidable-schema';
import type { Result } from './decision.types';
import { DecisionSchemaError } from './errors';
import * as publicApi from '../public_api';
import type { ExposedComponentDescriptor } from '../ui/expose-component';
import { createUiKit } from '../ui/ui-kit';
import { createComponentSelection } from './component-selection';
import { createSelectionSchema, resolveSelection } from './ui-selection';

const options = [
  { id: 'map', description: 'A map' },
  { id: 'chart', description: 'A chart' },
  { id: 'table', description: 'A table' },
];

const optionIds = options.map((option) => option.id);

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected to throw');
}

function manyResult(
  probabilities: Record<string, number>,
): Result<DecidableSchema> {
  const meta: Record<string, { probability: number }> = {};
  const value: Record<string, boolean> = {};
  for (const [id, probability] of Object.entries(probabilities)) {
    meta[id] = { probability };
    value[id] = probability >= 0.5;
  }
  return { value, meta } as unknown as Result<DecidableSchema>;
}

function oneResult(pick: string, confidence: number): Result<DecidableSchema> {
  return {
    value: { pick },
    meta: { pick: { confidence, probabilities: { [pick]: confidence } } },
  } as unknown as Result<DecidableSchema>;
}

test("'one' compiles to a single choice question with descriptions", () => {
  const schema = createSelectionSchema(options, 'one');

  const questions = compileDecision(schema);

  expect(questions).toEqual({
    pick: {
      type: 'choice',
      instructions: 'Which one fits the input best',
      options: { map: 'A map', chart: 'A chart', table: 'A table' },
    },
  });
});

test('{ max } compiles to one yesNo question per option', () => {
  const schema = createSelectionSchema(options, { max: 2 });

  const questions = compileDecision(schema);

  expect(questions).toEqual({
    map: {
      type: 'yesNo',
      instructions: 'Does this option fit the input: A map',
    },
    chart: {
      type: 'yesNo',
      instructions: 'Does this option fit the input: A chart',
    },
    table: {
      type: 'yesNo',
      instructions: 'Does this option fit the input: A table',
    },
  });
});

test("'one' schema decodes a hand-built envelope", () => {
  const schema = createSelectionSchema(options, 'one');

  const result = decodeDecision(schema, {
    kind: 'hashbrown.decision',
    version: 1,
    value: { pick: 'chart' },
    meta: {
      pick: {
        confidence: 0.8,
        probabilities: { map: 0.1, chart: 0.8, table: 0.1 },
      },
    },
  });

  expect(
    resolveSelection(result as Result<DecidableSchema>, 'one', optionIds),
  ).toEqual({
    ids: ['chart'],
    confident: true,
  });
});

test('{ max } schema decodes a hand-built envelope', () => {
  const schema = createSelectionSchema(options, { max: 2 });

  const result = decodeDecision(schema, {
    kind: 'hashbrown.decision',
    version: 1,
    value: { map: true, chart: false, table: true },
    meta: {
      map: { probability: 0.6 },
      chart: { probability: 0.2 },
      table: { probability: 0.9 },
    },
  });

  expect(
    resolveSelection(result as Result<DecidableSchema>, { max: 2 }, optionIds),
  ).toEqual({ ids: ['table', 'map'], confident: true });
});

test("'one' resolves the pick and compares confidence to the minimum", () => {
  const result = oneResult('map', 0.6);

  const high = resolveSelection(result, 'one', ['map'], 0.5);
  const low = resolveSelection(result, 'one', ['map'], 0.7);

  expect(high).toEqual({ ids: ['map'], confident: true });
  expect(low).toEqual({ ids: ['map'], confident: false });
});

test('{ max } keeps ids at or above 0.5 sorted by probability descending', () => {
  const result = manyResult({ map: 0.5, chart: 0.9, table: 0.4, list: 0.7 });

  const resolved = resolveSelection(result, { max: 5 }, [
    'map',
    'chart',
    'table',
    'list',
  ]);

  expect(resolved).toEqual({ ids: ['chart', 'list', 'map'], confident: true });
});

test('{ max } caps the number of ids', () => {
  const result = manyResult({ map: 0.6, chart: 0.9, table: 0.8 });

  const resolved = resolveSelection(result, { max: 2 }, optionIds);

  expect(resolved.ids).toEqual(['chart', 'table']);
});

test('{ max } keeps option order for ties', () => {
  const result = manyResult({ a: 0.7, b: 0.7, c: 0.7, d: 0.9, e: 0.7 });

  const resolved = resolveSelection(result, { max: 4 }, [
    'a',
    'b',
    'c',
    'd',
    'e',
  ]);

  expect(resolved.ids).toEqual(['d', 'a', 'b', 'c']);
});

test('{ max } keeps option order for ties with integer-like ids', () => {
  const result = manyResult({ b: 0.7, '2': 0.7, '1': 0.7, x: 0.9 });

  const resolved = resolveSelection(result, { max: 4 }, ['b', '2', '1', 'x']);

  expect(resolved.ids).toEqual(['x', 'b', '2', '1']);
});

test('{ max } is not confident when nothing is kept', () => {
  const result = manyResult({ map: 0.2, chart: 0.1 });

  const resolved = resolveSelection(result, { max: 2 }, ['map', 'chart']);

  expect(resolved).toEqual({ ids: [], confident: false });
});

test('{ max } confidence compares the best probability to the minimum', () => {
  const result = manyResult({ map: 0.6, chart: 0.55 });

  const confident = resolveSelection(result, { max: 2 }, ['map', 'chart'], 0.6);
  const unsure = resolveSelection(result, { max: 2 }, ['map', 'chart'], 0.61);

  expect(confident.confident).toBe(true);
  expect(unsure.confident).toBe(false);
});

test('resolveSelection does not mutate the result', () => {
  const result = manyResult({ a: 0.6, b: 0.9 });
  const snapshot = structuredClone(result);

  resolveSelection(result, { max: 2 }, ['a', 'b']);

  expect(result).toEqual(snapshot);
});

test('rejects ids containing a dot, naming the id', () => {
  const error = catchError(() =>
    createSelectionSchema([{ id: 'a.b', description: 'x' }], 'one'),
  );

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect((error as Error).message).toContain('a.b');
});

test('rejects an empty options array', () => {
  const error = catchError(() => createSelectionSchema([], 'one'));

  expect(error).toBeInstanceOf(DecisionSchemaError);
});

test('rejects duplicate ids', () => {
  const error = catchError(() =>
    createSelectionSchema(
      [
        { id: 'a', description: 'x' },
        { id: 'a', description: 'y' },
      ],
      { max: 1 },
    ),
  );

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect((error as Error).message).toContain('a');
});

test('rejects a max that is not a positive integer', () => {
  const zero = catchError(() => createSelectionSchema(options, { max: 0 }));
  const fraction = catchError(() =>
    createSelectionSchema(options, { max: 1.5 }),
  );

  expect(zero).toBeInstanceOf(DecisionSchemaError);
  expect(fraction).toBeInstanceOf(DecisionSchemaError);
});

test("rejects 'one' with more than 255 options", () => {
  const many = Array.from({ length: 256 }, (_, i) => ({
    id: `o${i}`,
    description: 'd',
  }));

  const error = catchError(() => createSelectionSchema(many, 'one'));

  expect(error).toBeInstanceOf(DecisionSchemaError);
});

test('rejects reserved ids', () => {
  const ids = ['__proto__', 'constructor', 'prototype'];

  const errors = ids.map((id) =>
    catchError(() => createSelectionSchema([{ id, description: 'x' }], 'one')),
  );

  for (const error of errors) {
    expect(error).toBeInstanceOf(DecisionSchemaError);
  }
  expect((errors[0] as Error).message).toContain('__proto__');
});

test('rejects reserved ids in { max } mode', () => {
  const error = catchError(() =>
    createSelectionSchema([{ id: '__proto__', description: 'x' }], { max: 1 }),
  );

  expect(error).toBeInstanceOf(DecisionSchemaError);
});

test('rejects an empty-string id', () => {
  const error = catchError(() =>
    createSelectionSchema([{ id: '', description: 'x' }], 'one'),
  );

  expect(error).toBeInstanceOf(DecisionSchemaError);
});

test('never drops an option', () => {
  const many = ['toString', 'valueOf', 'hasOwnProperty', 'a'].map((id) => ({
    id,
    description: 'd',
  }));

  const one = compileDecision(createSelectionSchema(many, 'one'));
  const multi = compileDecision(createSelectionSchema(many, { max: 4 }));

  expect(Object.keys((one['pick'] as { options: object }).options)).toEqual(
    many.map((o) => o.id),
  );
  expect(Object.keys(multi)).toEqual(many.map((o) => o.id));
});

test('createSelectionSchema is public, so a server can pin selection questions', () => {
  const client = compileDecision(createSelectionSchema(options, { max: 2 }));

  const server = compileDecision(
    publicApi.createSelectionSchema(options, { max: 2 }),
  );

  expect(server).toEqual(client);
  expect('ɵcreateSelectionSchema' in publicApi).toBe(false);
});

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

function questionIds(schema: DecidableSchema): string[] {
  const pick = compileDecision(schema)['pick'] as {
    options: Record<string, string | null>;
  };
  return Object.keys(pick.options);
}

test('createSelectionSchema accepts candidate items', () => {
  const items = [
    { id: 'flight', description: 'One aircraft' },
    { id: 'airport', description: 'An airport' },
  ];

  const schema = createSelectionSchema(items, 'one');

  expect(compileDecision(schema)).toEqual({
    pick: {
      type: 'choice',
      instructions: 'Which one fits the input best',
      options: { flight: 'One aircraft', airport: 'An airport' },
    },
  });
});

test('createSelectionSchema decides over components by name and description', () => {
  const definitions = [
    {
      name: 'Table',
      description: 'A table',
      children: [{ name: 'Row', description: 'A row' }],
    },
    { name: 'Flight', description: 'One aircraft', children: 'text' },
  ];

  const schema = createSelectionSchema(definitions, { max: 2 });

  expect(compileDecision(schema)).toEqual({
    Table: {
      type: 'yesNo',
      instructions: 'Does this option fit the input: A table',
    },
    Row: {
      type: 'yesNo',
      instructions: 'Does this option fit the input: A row',
    },
    Flight: {
      type: 'yesNo',
      instructions: 'Does this option fit the input: One aircraft',
    },
  });
});

test('createSelectionSchema flattens kits like the hooks: dedupe, children and order', () => {
  const flight = component('Flight');
  const airport = component('Airport');
  const table = component('Table', [component('Row')]);
  const kit = createUiKit({ components: [table, airport] });
  const components = [flight, kit, airport, flight];

  const pinned = compileDecision(createSelectionSchema(components, 'one'));
  const sent = compileDecision(
    createSelectionSchema(createComponentSelection(components).options, 'one'),
  );

  expect(questionIds(createSelectionSchema(components, 'one'))).toEqual([
    'Flight',
    'Table',
    'Row',
    'Airport',
  ]);
  expect(JSON.stringify(pinned)).toBe(JSON.stringify(sent));
});

test('createSelectionSchema terminates on a component that is its own descendant', () => {
  const tree: ExposedComponentDescriptor = {
    component: { name: 'Tree' },
    name: 'Tree',
    description: 'A tree',
    children: [],
  };
  (tree.children as unknown[]).push(component('Branch', [tree]));

  const schema = createSelectionSchema([tree], 'one');

  expect(questionIds(schema)).toEqual(['Tree', 'Branch']);
});

test('createSelectionSchema mixes candidate items, components and kits in declared order', () => {
  const kit = createUiKit({ components: [component('Airport')] });
  const entries = [
    { id: 'summary', description: 'A short summary' },
    kit,
    { name: 'Flight', description: 'One aircraft' },
  ];

  const schema = createSelectionSchema(entries, 'one');

  expect(compileDecision(schema)).toEqual({
    pick: {
      type: 'choice',
      instructions: 'Which one fits the input best',
      options: {
        summary: 'A short summary',
        Airport: 'The Airport component',
        Flight: 'One aircraft',
      },
    },
  });
});

test('createSelectionSchema treats an entry with an id as a candidate item, even with a name', () => {
  const entry = {
    id: 'flight',
    name: 'Flight',
    description: 'One aircraft',
    children: [{ name: 'Row', description: 'A row' }],
  };

  const schema = createSelectionSchema([entry], 'one');

  expect(questionIds(schema)).toEqual(['flight']);
});

test('createSelectionSchema rejects a candidate id that repeats a component name', () => {
  const entries = [
    { name: 'Flight', description: 'One aircraft' },
    { id: 'Flight', description: 'Also one aircraft' },
  ];

  const error = catchError(() => createSelectionSchema(entries, 'one'));

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect((error as DecisionSchemaError).message).toContain('"Flight"');
});

test('createSelectionSchema rejects a kit whose components flatten to nothing', () => {
  const kit = createUiKit({ components: [] });

  const error = catchError(() => createSelectionSchema([kit], 'one'));

  expect(error).toBeInstanceOf(DecisionSchemaError);
});

test('componentSelectionOptions is no longer public', () => {
  const api = publicApi as Record<string, unknown>;

  const exported = api['componentSelectionOptions'];

  expect(exported).toBeUndefined();
});

test('createSelectionSchema decides over children and kit members by name, even when they carry an id', () => {
  const child = { ...component('Row'), id: 'row-id' };
  const member = { ...component('Airport'), id: 'airport-id' };
  const table = component('Table', [child]);
  const kit = createUiKit({ components: [member] });
  const components = [table, kit];

  const pinned = compileDecision(createSelectionSchema(components, 'one'));
  const sent = compileDecision(
    createSelectionSchema(createComponentSelection(components).options, 'one'),
  );

  expect(questionIds(createSelectionSchema(components, 'one'))).toEqual([
    'Table',
    'Row',
    'Airport',
  ]);
  expect(JSON.stringify(pinned)).toBe(JSON.stringify(sent));
});

test('createSelectionSchema rejects an entry that is not an item, a component or a kit', () => {
  const entries = [
    { name: 'Flight', description: 'One aircraft' },
    { id: undefined, name: 'Airport', description: 'An airport' },
  ] as unknown as Parameters<typeof createSelectionSchema>[0];

  const error = catchError(() => createSelectionSchema(entries, 'one'));

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect((error as DecisionSchemaError).message).toContain('index 1');
});

test('createSelectionSchema rejects a kit from another copy of core', () => {
  const foreignKit = {
    components: [component('Flight')],
    registry: new Map(),
    ɵnonSelectable: new Set<string>(),
  } as unknown as Parameters<typeof createSelectionSchema>[0][number];

  const error = catchError(() => createSelectionSchema([foreignKit], 'one'));

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect((error as DecisionSchemaError).message).toContain('index 0');
});

test('createSelectionSchema rejects a declared child without a name', () => {
  const table = component('Table', [{ description: 'No name' }]);

  const error = catchError(() => createSelectionSchema([table], 'one'));

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect((error as DecisionSchemaError).message).toContain('No name');
});

test('createSelectionSchema skips a non-selectable kit and a non-selectable plain group', () => {
  const hiddenKit = createUiKit({
    components: [component('Hidden')],
    selectable: false,
  });
  const hiddenGroup = {
    components: [{ name: 'Ghost', description: 'A ghost' }],
    selectable: false,
  };

  const schema = createSelectionSchema(
    [{ id: 'map', description: 'A map' }, hiddenKit, hiddenGroup],
    'one',
  );

  expect(compileDecision(schema)).toEqual(
    compileDecision(
      createSelectionSchema([{ id: 'map', description: 'A map' }], 'one'),
    ),
  );
});

test('createSelectionSchema plain groups produce the same questions as the equivalent kits', () => {
  const parent = component('Parent', [component('Kid')]);
  const kit = createUiKit({ components: [parent, component('Other')] });
  const group = {
    components: [
      {
        name: 'Parent',
        description: 'The Parent component',
        children: [{ name: 'Kid', description: 'The Kid component' }],
      },
      { name: 'Other', description: 'The Other component' },
    ],
  };

  const fromKit = createSelectionSchema([kit], { max: 2 });
  const fromGroup = createSelectionSchema([group], { max: 2 });

  expect(compileDecision(fromGroup)).toEqual(compileDecision(fromKit));
});

test('createSelectionSchema rejects a malformed plain group naming the index', () => {
  const bad = { components: [{ name: 'NoDescription' }] };

  const error = catchError(() =>
    createSelectionSchema([{ id: 'a', description: 'A' }, bad as never], 'one'),
  );

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect((error as Error).message).toContain('index 1');
});
