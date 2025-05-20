import * as s from './public_api';
import { StreamSchemaParser } from '../streaming-json-parser/streaming-json-parser';

function parse(schema: s.HashbrownType, input: string) {
  const parser = new StreamSchemaParser(schema);
  return parser.parse(input);
}

test('it should parse very simple schema', () => {
  const schema = s.string('a string');
  const input = `"hello"`;

  const result = parse(schema, input);

  expect(result).toEqual('hello');
});

test('Boundary in middle of string', () => {
  const schema = s.string('str');

  const chunk1 = '"hello';
  const chunk2 = ' world"';
  const combined = chunk1 + chunk2;

  expect(parse(schema, chunk1)).toBe('');
  expect(parse(schema, combined)).toEqual('hello world');
});

test('Boundary in middle of escape sequence', () => {
  const schema = s.string('str');

  // JSON string for a\b is "\"a\\b\""
  const chunk1 = '"a\\';
  const chunk2 = '\\b"';
  const combined = chunk1 + chunk2;

  expect(parse(schema, chunk1)).toBe('');
  expect(parse(schema, combined)).toEqual('a\\b');
});

test('Partial Unicode escape sequence', () => {
  const schema = s.string('str');

  // JSON string for newline is "\"\\u000A\""
  const chunk1 = '"\\u0';
  const chunk2 = '00A"';
  const combined = chunk1 + chunk2;

  expect(parse(schema, chunk1)).toBe('');
  expect(parse(schema, combined)).toEqual('\n');
});

test('Number split at decimal point', () => {
  const schema = s.number('num');

  const chunk1 = '123.';
  const chunk2 = '456';
  const combined = chunk1 + chunk2;

  expect(parse(schema, chunk1)).toBe('');
  expect(parse(schema, combined)).toEqual(123.456);
});

test('Number split at exponent marker', () => {
  const schema = s.number('num');

  const chunk1 = '1e';
  const chunk2 = '+2';
  const combined = chunk1 + chunk2;

  expect(parse(schema, chunk1)).toBe('');
  expect(parse(schema, combined)).toEqual(1e2);
});

test('Empty array split', () => {
  const schema = s.array('arr', s.number('num'));

  const chunk1 = '[';
  const chunk2 = ']';
  const combined = chunk1 + chunk2;

  expect(parse(schema, chunk1)).toBe('');
  expect(parse(schema, combined)).toEqual([]);
});

test('Array split between elements', () => {
  const schema = s.array('arr', s.number('num'));

  const chunk1 = '[1,';
  const chunk2 = '2,3]';
  const combined = chunk1 + chunk2;

  expect(parse(schema, chunk1)).toBe('');
  expect(parse(schema, combined)).toEqual([1, 2, 3]);
});

test('Nested object split at inner boundary', () => {
  const schema = s.object('root', {
    x: s.object('nested', { y: s.object('inner', { z: s.number('z') }) }),
  });

  const chunk1 = '{"x":{"y":{';
  const chunk2 = '"z":4}}}';
  const combined = chunk1 + chunk2;

  expect(parse(schema, chunk1)).toBe('');
  expect(parse(schema, combined)).toEqual({ x: { y: { z: 4 } } });
});

test('Boolean primitive value', () => {
  const schema = s.boolean('b');

  const result = parse(schema, 'true');

  expect(result).toBe(true);
});

test('Trailing whitespace and newlines', () => {
  const schema = s.object('empty', {});

  const result = parse(schema, '{}  \n\n');

  expect(result).toEqual({});
});

xtest('Malformed JSON mid-stream throws error', () => {
  const schema = s.object('obj', { a: s.number('a') });

  expect(() => parse(schema, '{"a":1,{}}')).toThrow();
});

test('Unterminated string at EOF throws', () => {
  const schema = s.string('str');

  expect(parse(schema, '"oops')).toEqual('');
});

xtest('anyOf flattened parsing', () => {
  const schema = s.object('root', {
    value: s.anyOf([s.number('num'), s.string('str')]),
  });
  const input = '{"value":{0:123}}';
  const input2 = '{"value":{1:"hello"}}';

  expect(parse(schema, input)).toEqual({ value: 123 });
  expect(parse(schema, input2)).toEqual({ value: 'hello' });
});

test('Streaming string emits partial content', () => {
  const schema = s.streaming.string('str');

  expect(parse(schema, '"he')).toEqual('he');
  expect(parse(schema, '"hello')).toEqual('hello');
  expect(parse(schema, '"hello"')).toEqual('hello');
});

test('Streaming array emits elements incrementally', () => {
  const schema = s.streaming.array('arr', s.number('num'));

  expect(parse(schema, '[1')).toEqual([]);
  expect(parse(schema, '[1,')).toEqual([1]);
  expect(parse(schema, '[1,2,')).toEqual([1, 2]);
  expect(parse(schema, '[1,2,3]')).toEqual([1, 2, 3]);
});

test('Streaming object emits fields incrementally', () => {
  const schema = s.streaming.object('obj', {
    a: s.number('a'),
    b: s.number('b'),
  });

  expect(parse(schema, '{"a":1,')).toEqual({ a: 1 });
  expect(parse(schema, '{"a":1,"b":2}')).toEqual({ a: 1, b: 2 });
});

test('Whitespace-only fragments are ignored', () => {
  const schema = s.number('num');

  expect(parse(schema, '   \n')).toEqual('');
  expect(parse(schema, '   \n42')).toEqual(42);
});

test('Missing closing brace at EOF results in empty string', () => {
  const schema = s.object('obj', { a: s.number('a') });

  expect(parse(schema, '{"a":1')).toEqual('');
});

test('Extra data after valid JSON throws error', () => {
  const schema = s.object('obj', { a: s.number('a') });

  expect(() => parse(schema, '{"a":1}garbage')).toThrow();
});

xtest('anyOf envelope parsing across chunks (number branch)', () => {
  const schema = s.object('root', {
    value: s.anyOf([s.number('num'), s.string('str')]),
  });
  const chunk1 = '{"value":{0:';
  const chunk2 = '123}}';
  const combined = chunk1 + chunk2;

  expect(parse(schema, chunk1)).toBe('');
  expect(parse(schema, combined)).toEqual({ value: 123 });
});

xtest('anyOf envelope parsing across chunks (string branch)', () => {
  const schema = s.object('root', {
    value: s.anyOf([s.number('num'), s.streaming.string('str')]),
  });

  const chunk1 = '{"value":{1:"he';
  const chunk2 = 'llo"}}';
  const combined = chunk1 + chunk2;

  expect(parse(schema, chunk1)).toEqual({ value: 'he' });
  expect(parse(schema, combined)).toEqual({ value: 'hello' });
});
