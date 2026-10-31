import { expect, test } from 'vitest';
import type { WorkbenchFrame } from '../examples/quickstart/runtime/workbench';
import {
  createInspectorModeMemory,
  defaultInspectorMode,
  parsePartialJson,
  workbenchInspectorModes,
  workbenchStateTree,
} from '../examples/quickstart/runtime/workbench-inspector-modes';

const frame = {
  json: '{"title":"A"}',
  props: { title: 'A' },
} as unknown as WorkbenchFrame;

const sections = {
  format: 'ui' as const,
  application: { turn: 1 },
  top: { heading: 'Typed choice and confidence', value: 'top-value' },
  bottom: { heading: 'Validation result', value: 'bottom-value' },
  raw: { raw: true },
};

test('parses a partial JSON document into the values that have landed', () => {
  const text = '{"title": "Sh';

  const result = parsePartialJson(text);

  expect(result).toEqual({ title: 'Sh' });
});

test('returns undefined for empty or whitespace-only text', () => {
  const empty = parsePartialJson('');
  const blank = parsePartialJson('   \n');

  expect(empty).toBeUndefined();
  expect(blank).toBeUndefined();
});

test('does not throw on text that is not JSON', () => {
  const parse = () => parsePartialJson('not json');

  expect(parse).not.toThrow();
});

test('offers four modes on the UI tab', () => {
  const modes = workbenchInspectorModes({ tab: 'ui', frame, ...sections });

  expect(modes.map((mode) => mode.id)).toEqual([
    'schema',
    'raw',
    'parsed',
    'resolved',
  ]);
  expect(modes.map((mode) => mode.label)).toEqual([
    'Schema',
    'Raw',
    'Parsed',
    'Resolved',
  ]);
  expect(modes.find((mode) => mode.id === 'schema')?.value).toBe('top-value');
  expect(modes.find((mode) => mode.id === 'resolved')?.value).toEqual({
    title: 'A',
  });
  expect(modes.find((mode) => mode.id === 'parsed')?.value).toEqual({
    title: 'A',
  });
});

test('offers three modes on the JSON tab', () => {
  const modes = workbenchInspectorModes({ tab: 'json', frame, ...sections });

  expect(modes.map((mode) => mode.id)).toEqual(['raw', 'parsed', 'resolved']);
  expect(modes.map((mode) => mode.label)).toEqual([
    'Raw',
    'Parsed',
    'Resolved',
  ]);
});

test('offers tree, json and raw on the State tab with the moment merged in', () => {
  const modes = workbenchInspectorModes({ tab: 'state', frame, ...sections });

  expect(modes.map((mode) => mode.id)).toEqual(['tree', 'json', 'raw']);
  expect(modes.map((mode) => mode.label)).toEqual(['Tree', 'JSON', 'Raw']);
  expect(modes[0].value).toEqual({ turn: 1, moment: 'bottom-value' });
  expect(modes[1].value).toEqual({ turn: 1, moment: 'bottom-value' });
  expect(modes[2].value).toEqual({ raw: true });
});

test('falls back to top, bottom and raw for the decision format', () => {
  const modes = workbenchInspectorModes({
    ...sections,
    tab: 'ui',
    format: 'decision',
    frame,
  });

  expect(modes).toEqual([
    { id: 'top', label: 'Typed choice', value: 'top-value' },
    { id: 'bottom', label: 'Validation result', value: 'bottom-value' },
    { id: 'raw', label: 'Raw', value: { raw: true } },
  ]);
});

test('keeps the generative modes stable before any JSON has streamed', () => {
  const waiting = { json: '' } as unknown as WorkbenchFrame;

  const before = workbenchInspectorModes({
    ...sections,
    tab: 'json',
    frame: waiting,
  });
  const empty = workbenchInspectorModes({
    ...sections,
    tab: 'ui',
    frame: null,
  });

  expect(before.map((mode) => mode.id)).toEqual(['raw', 'parsed', 'resolved']);
  expect(before.map((mode) => mode.value)).toEqual([
    undefined,
    undefined,
    undefined,
  ]);
  expect(empty.map((mode) => mode.id)).toEqual([
    'schema',
    'raw',
    'parsed',
    'resolved',
  ]);
});

test('keeps top, bottom and raw for formats that do not stream generative props', () => {
  const formats = ['text', 'history', 'workflow', 'selection'] as const;

  const ids = formats.map((format) =>
    workbenchInspectorModes({ ...sections, format, tab: 'json', frame }).map(
      (mode) => mode.id,
    ),
  );

  expect(ids).toEqual(formats.map(() => ['top', 'bottom', 'raw']));
});

test('chooses a default mode per tab', () => {
  const ui = workbenchInspectorModes({ tab: 'ui', frame, ...sections });
  const json = workbenchInspectorModes({ tab: 'json', frame, ...sections });
  const state = workbenchInspectorModes({ tab: 'state', frame, ...sections });
  const other = workbenchInspectorModes({
    ...sections,
    tab: 'ui',
    format: 'structured',
    frame,
  });

  expect(defaultInspectorMode('ui', ui)).toBe('resolved');
  expect(defaultInspectorMode('json', json)).toBe('parsed');
  expect(defaultInspectorMode('state', state)).toBe('tree');
  expect(defaultInspectorMode('ui', other)).toBe('top');
});

test('remembers the chosen mode per tab without leaking between tabs', () => {
  const memory = createInspectorModeMemory();

  memory.set('ui', 'raw');
  memory.set('json', 'resolved');

  expect(memory.get('ui')).toBe('raw');
  expect(memory.get('json')).toBe('resolved');
  expect(memory.get('state')).toBeUndefined();
});

test('drops trailing connector words from the two-word mode labels', () => {
  const input = {
    tab: 'model',
    frame: null,
    application: {},
    raw: null,
  };

  const modes = workbenchInspectorModes({
    ...input,
    top: { heading: 'Browser-local model', value: 1 },
    bottom: { heading: 'Preparation and inference', value: 2 },
  });

  expect(modes.map((mode) => mode.label)).toEqual([
    'Browser-local model',
    'Preparation',
    'Raw',
  ]);
});

test('keeps recipe sections instead of the JSON modes when a lesson recipe supplies them', () => {
  const recipe = { ...sections, recipe: true };

  const modes = workbenchInspectorModes({
    ...recipe,
    tab: 'ui',
    frame,
  });

  expect(modes.map((mode) => mode.id)).toEqual(['top', 'bottom', 'raw']);
  expect(modes[1].value).toBe('bottom-value');
});

test('the State tree keeps a non-object application under value', () => {
  const inputs = [null, 'Waiting', ['a']];

  const trees = inputs.map((application) =>
    workbenchStateTree(application, 'moment'),
  );

  expect(trees).toEqual([
    { value: null, moment: 'moment' },
    { value: 'Waiting', moment: 'moment' },
    { value: ['a'], moment: 'moment' },
  ]);
  expect(workbenchStateTree({ turn: 1 }, 'm')).toEqual({
    turn: 1,
    moment: 'm',
  });
});

test('the State tab tree does not spread a string application', () => {
  const modes = workbenchInspectorModes({
    ...sections,
    application: 'Waiting',
    tab: 'state',
    frame,
  });

  expect(modes[0].value).toEqual({ value: 'Waiting', moment: 'bottom-value' });
});
