import { signal } from '@angular/core';
import { s } from '@hashbrownai/core';
import { injectJsonParser } from './inject-json-parser.fn';

test('injectJsonParser parses growing json signals', () => {
  const schema = s.streaming.string('text');
  const json = signal('"he');
  const parser = injectJsonParser(json, schema);

  expect(parser.value()).toBe('he');
  expect(parser.parserState().isComplete).toBe(false);

  json.set('"hello"');

  expect(parser.value()).toBe('hello');
  expect(parser.parserState().isComplete).toBe(true);
});

test('injectJsonParser resets when json changes are not prefix updates', () => {
  const schema = s.streaming.string('text');
  const json = signal('"he');
  const parser = injectJsonParser(json, schema);

  expect(parser.value()).toBe('he');

  json.set('"yo"');

  expect(parser.value()).toBe('yo');
  expect(parser.parserState().isComplete).toBe(true);
});

test('injectJsonParser re-resolves when schema changes without resetting parser state', () => {
  const json = signal('{"a":"hi"}');
  const schemaA = s.streaming.object('root', {
    a: s.streaming.string('a'),
  });
  const schemaB = s.streaming.object('root', {
    b: s.streaming.string('b'),
  });
  const schemaSignal = signal(schemaA);
  const parser = injectJsonParser(json, schemaSignal);

  const firstState = parser.parserState();

  expect(parser.value()).toEqual({ a: 'hi' });

  schemaSignal.set(schemaB);

  expect(parser.parserState()).toBe(firstState);
  expect(parser.value()).toBeUndefined();
});

test('injectJsonParser resolves root value when no schema and json is partial', () => {
  const json = signal('[1,');
  const parser = injectJsonParser(json);

  expect(parser.value()).toEqual([1]);
  expect(parser.parserState().isComplete).toBe(false);

  json.set('[1,2]');

  expect(parser.value()).toEqual([1, 2]);
  expect(parser.parserState().isComplete).toBe(true);
});
