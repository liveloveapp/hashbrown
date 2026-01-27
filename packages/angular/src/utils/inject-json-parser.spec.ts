import { s } from '@hashbrownai/core';
import { injectJsonParser } from './inject-json-parser.fn';

test('injectJsonParser preserves identity for unchanged branches', () => {
  const schema = s.streaming.object('obj', {
    a: s.streaming.array('a', s.string('a')),
    b: s.streaming.array('b', s.string('b')),
  });

  const parser = injectJsonParser(schema);

  parser.parseChunk('{"a":["x"],');

  const firstValue = parser.value();
  const firstA = firstValue?.a;
  const firstB = firstValue?.b;

  expect(firstValue).toEqual({ a: ['x'], b: [] });

  parser.parseChunk('"b":["y"]}');

  const secondValue = parser.value();

  expect(secondValue).toEqual({ a: ['x'], b: ['y'] });
  expect(secondValue?.a).toBe(firstA);
  expect(secondValue?.b).not.toBe(firstB);
});

test('injectJsonParser streams partial string values', () => {
  const schema = s.streaming.string('text');
  const parser = injectJsonParser(schema);

  parser.parseChunk('"he');

  expect(parser.value()).toBe('he');
  expect(parser.error()).toBeUndefined();
  expect(parser.parserState().isComplete).toBe(false);

  parser.parseChunk('llo"');

  expect(parser.value()).toBe('hello');
  expect(parser.parserState().isComplete).toBe(true);
});

test('injectJsonParser preserves streaming array identity when no new match', () => {
  const schema = s.streaming.array('arr', s.string('str'));
  const parser = injectJsonParser(schema);

  parser.parseChunk('["a","b');

  const firstValue = parser.value();

  parser.parseChunk('c');

  const secondValue = parser.value();

  expect(firstValue).toEqual(['a']);
  expect(secondValue).toEqual(['a']);
  expect(secondValue).toBe(firstValue);
});

test('injectJsonParser exposes parser errors without schema', () => {
  const parser = injectJsonParser();

  parser.parseChunk('{"a":1,]');

  expect(parser.value()).toBeUndefined();
  expect(parser.error()).toBeDefined();
  expect(parser.parserState().error).not.toBeNull();
});

test('injectJsonParser resolves root value when no schema and JSON completes', () => {
  const parser = injectJsonParser();

  parser.parseChunk('{"a":1}');

  expect(parser.value()).toEqual({ a: 1 });
  expect(parser.error()).toBeUndefined();
  expect(parser.parserState().isComplete).toBe(true);
});

test('injectJsonParser returns root resolvedValue even when JSON is incomplete', () => {
  const parser = injectJsonParser();

  parser.parseChunk('[1,');

  expect(parser.value()).toEqual([1]);
  expect(parser.parserState().isComplete).toBe(false);
});

test('injectJsonParser keeps value undefined when root has no resolved value', () => {
  const parser = injectJsonParser();

  parser.parseChunk('"he');

  expect(parser.value()).toBeUndefined();
  expect(parser.parserState().isComplete).toBe(false);
});

test('injectJsonParser reset clears resolved value', () => {
  const schema = s.streaming.string('text');
  const parser = injectJsonParser(schema);

  parser.parseChunk('"he');

  expect(parser.value()).toBe('he');

  parser.reset();

  expect(parser.value()).toBeUndefined();
  expect(parser.error()).toBeUndefined();
});
