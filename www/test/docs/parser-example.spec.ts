import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDoc } from '../../src/lib/content';
import { create, push } from '@cacheplane/partial-json';
import { s } from '@hashbrownai/core';
import { expect, test, vi } from 'vitest';
import {
  parserDemoState,
  parserExamples,
  startLocalJsonStream,
  weatherSchema,
} from '../../examples/quickstart/runtime/json-parser-demo';

function resolveJson(json: string) {
  const parser = push(create(), json);

  return { parser, result: s.fromJsonAst(weatherSchema, parser).result };
}

test('weather fixtures expose an unfinished forecast and alert fields as they resolve', () => {
  const chunks = parserExamples.valid;
  const cityOpen = resolveJson(chunks.slice(0, 1).join(''));
  const forecastOpen = resolveJson(chunks.slice(0, 3).join(''));
  const unfinishedSeverity = resolveJson(chunks.slice(0, 5).join(''));
  const firstAlert = resolveJson(chunks.slice(0, 6).join(''));
  const complete = resolveJson(chunks.join(''));

  expect(cityOpen.result.state).not.toBe('match');
  expect(forecastOpen.result).toMatchObject({
    state: 'match',
    value: { city: 'Portland', forecast: 'Clouds' },
  });
  expect(unfinishedSeverity.result).toMatchObject({
    state: 'match',
    value: { alerts: [] },
  });
  expect(firstAlert.parser.complete).toBe(false);
  expect(
    firstAlert.parser.nodes
      .filter((node) => node.kind === 'object')
      .every((node) => node.status === 'incomplete'),
  ).toBe(true);
  expect(firstAlert.result).toMatchObject({
    state: 'match',
    value: { alerts: [{ title: 'Wet roads', severity: 'low' }] },
  });
  expect(complete.parser.complete).toBe(true);
  expect(complete.result).toMatchObject({
    state: 'match',
    value: {
      city: 'Portland',
      forecast: 'Clouds clearing by noon.',
      alerts: [
        { title: 'Wet roads', severity: 'low' },
        { title: 'Gusty wind', severity: 'medium' },
      ],
    },
  });
});

test('error and truncation fixtures exercise real parser and schema boundaries', () => {
  const malformed = resolveJson(parserExamples.malformed.join(''));
  const invalid = resolveJson(parserExamples['schema-invalid'].join(''));
  const truncated = resolveJson(parserExamples.truncated.join(''));

  expect(malformed.parser.error).toBeTruthy();
  expect(invalid.parser.complete).toBe(true);
  expect(invalid.result).toMatchObject({
    state: 'match',
    value: { alerts: [] },
  });
  expect(
    parserDemoState({
      source: 'ended',
      json: parserExamples['schema-invalid'].join(''),
      isComplete: invalid.parser.complete,
      error: invalid.parser.error,
    }),
  ).toMatchObject({ status: 'Invalid JSON or schema', showPreview: false });
  expect(truncated.parser.error).toBeNull();
  expect(truncated.parser.complete).toBe(false);
  expect(truncated.result.state).toBe('match');
});

test.each([
  ['idle', false, undefined, 'Idle', false, false],
  ['streaming', true, undefined, 'Streaming preview', true, false],
  ['ended', true, undefined, 'Complete valid document', false, true],
  ['ended', false, undefined, 'Incomplete document', false, false],
  ['stopped', true, undefined, 'Stopped', false, false],
  ['ended', true, new Error('schema'), 'Invalid JSON or schema', false, false],
] as const)(
  'classifies %s source with parser completion %s',
  (source, isComplete, error, status, busy, complete) => {
    const value = { city: 'Portland', forecast: 'Clear', alerts: [] };
    const result = parserDemoState({
      source,
      isComplete,
      error,
      json: JSON.stringify(value),
    });

    expect(result).toMatchObject({ status, busy, isComplete: complete });
    expect(result.showPreview).toBe(source !== 'idle' && !error);
  },
);

test('finite source ends only after its final chunk and cancellation prevents stale work', () => {
  vi.useFakeTimers();
  try {
    const chunks: string[] = [];
    const ended = vi.fn();
    const cancel = startLocalJsonStream(
      ['first', 'second'],
      (chunk) => chunks.push(chunk),
      ended,
    );

    expect(chunks).toEqual([]);
    vi.advanceTimersByTime(350);
    expect(chunks).toEqual(['first']);
    expect(ended).not.toHaveBeenCalled();
    cancel();
    cancel();
    vi.runAllTimers();

    expect(chunks).toEqual(['first']);
    expect(ended).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test('finite source delivers ordered chunks and exactly one end notification', () => {
  vi.useFakeTimers();
  try {
    const chunks: string[] = [];
    const ended = vi.fn();

    startLocalJsonStream(
      ['first', 'second'],
      (chunk) => chunks.push(chunk),
      ended,
    );
    vi.runAllTimers();

    expect(chunks).toEqual(['first', 'second']);
    expect(ended).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

test('a lexically complete document without a valid resolved value cannot succeed', () => {
  const missing = parserDemoState({
    source: 'ended',
    isComplete: true,
    error: undefined,
    json: '{}',
  });
  const invalid = parserDemoState({
    source: 'ended',
    isComplete: true,
    error: undefined,
    json: '{"city":12}',
  });

  expect(missing.isComplete).toBe(false);
  expect(invalid.isComplete).toBe(false);
  expect(invalid.showPreview).toBe(false);
});

test('replacing or unmounting a source cancels every old chunk and end callback', () => {
  vi.useFakeTimers();
  try {
    let json = '';
    let ends = 0;
    const cancelOld = startLocalJsonStream(
      ['old', 'stale'],
      (chunk) => {
        json += chunk;
      },
      () => {
        ends++;
      },
    );
    vi.advanceTimersByTime(350);

    cancelOld();
    json = '';
    const cancelReplacement = startLocalJsonStream(
      ['new', ' value'],
      (chunk) => {
        json += chunk;
      },
      () => {
        ends++;
      },
    );
    vi.advanceTimersByTime(350);
    expect(json).toBe('new');
    cancelReplacement();
    vi.runAllTimers();

    expect(json).toBe('new');
    expect(ends).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test.each([
  '{}',
  '{"city":"Portland"}',
  '{"city":"Portland","forecast":12,"alerts":[]}',
  '{"city":"Portland","forecast":"Clear","alerts":[{"title":"Wind"}]}',
])(
  'rejects complete JSON with missing or invalid required fields: %s',
  (json) => {
    const state = parserDemoState({
      source: 'ended',
      isComplete: true,
      error: undefined,
      json,
    });

    expect(state.isComplete).toBe(false);
    expect(state.status).toBe('Invalid JSON or schema');
    expect(state.showPreview).toBe(false);
  },
);

test.each(['react', 'angular'] as const)(
  '%s parser guide publishes the exact checked source in closed disclosures',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'json-parser'])?.body ?? '';
    const files = [
      'runtime/json-parser-demo.ts',
      sdk === 'react'
        ? 'react/src/JsonParserDemo.tsx'
        : 'angular/src/app/json-parser-demo.ts',
    ];

    for (const file of files) {
      const disclosure =
        body
          .split(`<hb-expander title="Complete ${file}">`)[1]
          ?.split('</hb-expander>')[0] ?? '';
      const snippet = disclosure.match(/```(?:ts|tsx)\n([\s\S]*?)\n```/)?.[1];

      expect(snippet?.trim(), file).toBe(
        readFileSync(
          resolve(import.meta.dirname, '../../examples/quickstart', file),
          'utf8',
        ).trim(),
      );
      expect(disclosure).not.toContain('default-open');
    }
    expect(body).toContain(`<hb-docs-demo demo="json-parser-${sdk}">`);
    expect(body).toContain('finite local');
    expect(body).toContain('no live model');
    expect(body).toContain('JSON.parse');
    expect(body).toContain('Stop');
    expect(body).toContain('Reset');
  },
);

test.each(['missing-streaming-field', 'wrong-type'] as const)(
  'rejects the complete %s fixture at the source boundary',
  (example) => {
    const json = parserExamples[example].join('');
    const parsed = resolveJson(json);

    const state = parserDemoState({
      source: 'ended',
      json,
      isComplete: parsed.parser.complete,
      error: parsed.parser.error,
    });

    expect(parsed.parser.complete).toBe(true);
    expect(state.status).toBe('Invalid JSON or schema');
    expect(state.showPreview).toBe(false);
  },
);

test('reads native parser completion and rejects trailing garbage', () => {
  const open = push(create(), '{"city":"Portland"');
  const closed = push(open, ',"forecast":"Clear","alerts":[]}');
  const invalid = push(closed, '!');

  expect(open.complete).toBe(false);
  expect(closed.complete).toBe(true);
  expect(invalid.error).toBeTruthy();
});
