import { renderHook } from '@testing-library/react';
import { s } from '@hashbrownai/core';
import { useJsonParser } from './use-json-parser';

test('useJsonParser parses growing json strings', () => {
  const schema = s.streaming.string('text');

  const { result, rerender } = renderHook(
    ({ json }) => useJsonParser(json, schema),
    {
      initialProps: { json: '"he' },
    },
  );

  expect(result.current.value).toBe('he');
  expect(result.current.parserState.isComplete).toBe(false);

  rerender({ json: '"hello"' });

  expect(result.current.value).toBe('hello');
  expect(result.current.parserState.isComplete).toBe(true);
});

test('useJsonParser resets when json changes are not prefix updates', () => {
  const schema = s.streaming.string('text');

  const { result, rerender } = renderHook(
    ({ json }) => useJsonParser(json, schema),
    {
      initialProps: { json: '"he' },
    },
  );

  expect(result.current.value).toBe('he');

  rerender({ json: '"yo"' });

  expect(result.current.value).toBe('yo');
  expect(result.current.parserState.isComplete).toBe(true);
});

test('useJsonParser re-resolves when schema changes without resetting parser state', () => {
  const json = '{"a":"hi"}';
  const schemaA = s.streaming.object('root', {
    a: s.streaming.string('a'),
  });
  const schemaB = s.streaming.object('root', {
    b: s.streaming.string('b'),
  });

  const { result, rerender } = renderHook(
    ({ schema }) => useJsonParser(json, schema),
    {
      initialProps: { schema: schemaA },
    },
  );

  const firstState = result.current.parserState;

  expect(result.current.value).toEqual({ a: 'hi' });

  rerender({ schema: schemaB });

  expect(result.current.parserState).toBe(firstState);
  expect(result.current.value).toBeUndefined();
});

test('useJsonParser resolves root value when no schema and json is partial', () => {
  const { result, rerender } = renderHook(
    ({ json }) => useJsonParser(json),
    {
      initialProps: { json: '[1,' },
    },
  );

  expect(result.current.value).toEqual([1]);
  expect(result.current.parserState.isComplete).toBe(false);

  rerender({ json: '[1,2]' });

  expect(result.current.value).toEqual([1, 2]);
  expect(result.current.parserState.isComplete).toBe(true);
});

test('useJsonParser resolves partial string value when no schema', () => {
  const { result, rerender } = renderHook(
    ({ json }) => useJsonParser(json),
    {
      initialProps: { json: '"he' },
    },
  );

  expect(result.current.value).toBe('he');
  expect(result.current.parserState.isComplete).toBe(false);

  rerender({ json: '"hello"' });

  expect(result.current.value).toBe('hello');
  expect(result.current.parserState.isComplete).toBe(true);
});
