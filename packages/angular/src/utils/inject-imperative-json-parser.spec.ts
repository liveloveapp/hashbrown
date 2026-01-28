import { s } from '@hashbrownai/core';
import { injectImperativeJsonParser } from './inject-imperative-json-parser.fn';

test('injectImperativeJsonParser preserves identity for unchanged branches', () => {
  const schema = s.streaming.object('obj', {
    a: s.streaming.array('a', s.string('a')),
    b: s.streaming.array('b', s.string('b')),
  });

  const parser = injectImperativeJsonParser(schema);

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

test('injectImperativeJsonParser streams partial string values', () => {
  const schema = s.streaming.string('text');
  const parser = injectImperativeJsonParser(schema);

  parser.parseChunk('"he');

  expect(parser.value()).toBe('he');
  expect(parser.error()).toBeUndefined();
  expect(parser.parserState().isComplete).toBe(false);

  parser.parseChunk('llo"');

  expect(parser.value()).toBe('hello');
  expect(parser.parserState().isComplete).toBe(true);
});

test('injectImperativeJsonParser preserves streaming array identity when no new match', () => {
  const schema = s.streaming.array('arr', s.string('str'));
  const parser = injectImperativeJsonParser(schema);

  parser.parseChunk('["a","b');

  const firstValue = parser.value();

  parser.parseChunk('c');

  const secondValue = parser.value();

  expect(firstValue).toEqual(['a']);
  expect(secondValue).toEqual(['a']);
  expect(secondValue).toBe(firstValue);
});

test('injectImperativeJsonParser exposes parser errors without schema', () => {
  const parser = injectImperativeJsonParser();

  parser.parseChunk('{"a":1,]');

  expect(parser.value()).toBeUndefined();
  expect(parser.error()).toBeDefined();
  expect(parser.parserState().error).not.toBeNull();
});

test('injectImperativeJsonParser resolves root value when no schema and JSON completes', () => {
  const parser = injectImperativeJsonParser();

  parser.parseChunk('{"a":1}');

  expect(parser.value()).toEqual({ a: 1 });
  expect(parser.error()).toBeUndefined();
  expect(parser.parserState().isComplete).toBe(true);
});

test('injectImperativeJsonParser returns root resolvedValue even when JSON is incomplete', () => {
  const parser = injectImperativeJsonParser();

  parser.parseChunk('[1,');

  expect(parser.value()).toEqual([1]);
  expect(parser.parserState().isComplete).toBe(false);
});

test('injectImperativeJsonParser keeps value undefined when root has no resolved value', () => {
  const parser = injectImperativeJsonParser();

  parser.parseChunk('"he');

  expect(parser.value()).toBeUndefined();
  expect(parser.parserState().isComplete).toBe(false);
});

test('injectImperativeJsonParser reset clears resolved value', () => {
  const schema = s.streaming.string('text');
  const parser = injectImperativeJsonParser(schema);

  parser.parseChunk('"he');

  expect(parser.value()).toBe('he');

  parser.reset();

  expect(parser.value()).toBeUndefined();
  expect(parser.error()).toBeUndefined();
});
