import { act, renderHook } from '@testing-library/react';
import { s } from '@hashbrownai/core';
import { useJsonParser } from './use-json-parser';

test('useJsonParser preserves identity for unchanged branches', () => {
  const schema = s.streaming.object('obj', {
    a: s.streaming.array('a', s.string('a')),
    b: s.streaming.array('b', s.string('b')),
  });

  const { result } = renderHook(() => useJsonParser(schema));

  act(() => {
    result.current.parseChunk('{"a":["x"],');
  });

  const firstValue = result.current.value;
  const firstA = firstValue?.a;
  const firstB = firstValue?.b;

  expect(firstValue).toEqual({ a: ['x'], b: [] });

  act(() => {
    result.current.parseChunk('"b":["y"]}');
  });

  const secondValue = result.current.value;

  expect(secondValue).toEqual({ a: ['x'], b: ['y'] });
  expect(secondValue?.a).toBe(firstA);
  expect(secondValue?.b).not.toBe(firstB);
});

test('useJsonParser streams partial string values', () => {
  const schema = s.streaming.string('text');
  const { result } = renderHook(() => useJsonParser(schema));

  act(() => {
    result.current.parseChunk('"he');
  });

  expect(result.current.value).toBe('he');
  expect(result.current.error).toBeUndefined();
  expect(result.current.parserState.isComplete).toBe(false);

  act(() => {
    result.current.parseChunk('llo"');
  });

  expect(result.current.value).toBe('hello');
  expect(result.current.parserState.isComplete).toBe(true);
});

test('useJsonParser preserves streaming array identity when no new match', () => {
  const schema = s.streaming.array('arr', s.string('str'));
  const { result } = renderHook(() => useJsonParser(schema));

  act(() => {
    result.current.parseChunk('["a","b');
  });

  const firstValue = result.current.value;

  act(() => {
    result.current.parseChunk('c');
  });

  const secondValue = result.current.value;

  expect(firstValue).toEqual(['a']);
  expect(secondValue).toEqual(['a']);
  expect(secondValue).toBe(firstValue);
});

test('useJsonParser exposes parser errors without schema', () => {
  const { result } = renderHook(() => useJsonParser());

  act(() => {
    result.current.parseChunk('{"a":1,]');
  });

  expect(result.current.value).toBeUndefined();
  expect(result.current.error).toBeDefined();
  expect(result.current.parserState.error).not.toBeNull();
});

test('useJsonParser resolves root value when no schema and JSON completes', () => {
  const { result } = renderHook(() => useJsonParser());

  act(() => {
    result.current.parseChunk('{"a":1}');
  });

  expect(result.current.value).toEqual({ a: 1 });
  expect(result.current.error).toBeUndefined();
  expect(result.current.parserState.isComplete).toBe(true);
});

test('useJsonParser returns root resolvedValue even when JSON is incomplete', () => {
  const { result } = renderHook(() => useJsonParser());

  act(() => {
    result.current.parseChunk('[1,');
  });

  expect(result.current.value).toEqual([1]);
  expect(result.current.parserState.isComplete).toBe(false);
});

test('useJsonParser keeps value undefined when root has no resolved value', () => {
  const { result } = renderHook(() => useJsonParser());

  act(() => {
    result.current.parseChunk('"he');
  });

  expect(result.current.value).toBeUndefined();
  expect(result.current.parserState.isComplete).toBe(false);
});

test('useJsonParser reset clears resolved value', () => {
  const schema = s.streaming.string('text');
  const { result } = renderHook(() => useJsonParser(schema));

  act(() => {
    result.current.parseChunk('"he');
  });

  expect(result.current.value).toBe('he');

  act(() => {
    result.current.reset();
  });

  expect(result.current.value).toBeUndefined();
  expect(result.current.error).toBeUndefined();
});
