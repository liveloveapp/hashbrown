import { applyJsonPatch } from './json-patch';
import type { JsonValue } from './types';

test('adds, removes, and replaces object members', () => {
  const document = { title: 'before', remove: true };

  const result = applyJsonPatch(document, [
    { op: 'add', path: '/count', value: 1 },
    { op: 'replace', path: '/title', value: 'after' },
    { op: 'remove', path: '/remove' },
  ]);

  expect(result).toEqual({ title: 'after', count: 1 });
  expect(Object.isFrozen(result)).toBe(true);
});

test('handles empty root paths and absent documents', () => {
  const added = applyJsonPatch(undefined, [{ op: 'add', path: '', value: 1 }]);
  const removed = applyJsonPatch({ ready: true }, [{ op: 'remove', path: '' }]);

  expect(added).toBe(1);
  expect(removed).toBeUndefined();
  expect(() =>
    applyJsonPatch(undefined, [{ op: 'replace', path: '', value: 1 }]),
  ).toThrow();
});

test('treats positive and negative zero as equal JSON numbers in test operations', () => {
  const result = applyJsonPatch(0, [{ op: 'test', path: '', value: -0 }]);

  expect(result).toBe(0);
});

test('decodes JSON pointer escapes for object keys', () => {
  const document = { 'a/b': { '~key': 1 } };

  const result = applyJsonPatch(document, [
    { op: 'replace', path: '/a~1b/~0key', value: 2 },
  ]);

  expect(result).toEqual({ 'a/b': { '~key': 2 } });
});

test('adds at array indexes and appends only with add', () => {
  const document = { values: ['first', 'third'] };

  const result = applyJsonPatch(document, [
    { op: 'add', path: '/values/1', value: 'second' },
    { op: 'add', path: '/values/-', value: 'fourth' },
  ]);

  expect(result).toEqual({ values: ['first', 'second', 'third', 'fourth'] });
  expect(() =>
    applyJsonPatch(document, [
      { op: 'replace', path: '/values/-', value: 'nope' },
    ]),
  ).toThrow();
  expect(() =>
    applyJsonPatch(document, [{ op: 'remove', path: '/values/-' }]),
  ).toThrow();
});

test('moves values after removing the source and rejects descendants', () => {
  const document = {
    values: ['first', 'second', 'third'],
    object: { child: 1 },
  };

  const result = applyJsonPatch(document, [
    { op: 'move', from: '/values/0', path: '/values/2' },
  ]);

  expect(result).toEqual({
    values: ['second', 'third', 'first'],
    object: { child: 1 },
  });
  expect(() =>
    applyJsonPatch(document, [
      { op: 'move', from: '/object', path: '/object/child/new' },
    ]),
  ).toThrow();
});

test('copies deeply owned values and verifies test operations with deep JSON equality', () => {
  const copied = { source: { nested: ['value'] } };
  const result = applyJsonPatch(copied, [
    { op: 'copy', from: '/source', path: '/copy' },
    { op: 'test', path: '/copy', value: { nested: ['value'] } },
  ]) as { source: { nested: string[] }; copy: { nested: string[] } };

  copied.source.nested[0] = 'changed';

  expect(result).toEqual({
    source: { nested: ['value'] },
    copy: { nested: ['value'] },
  });
  expect(result.copy).not.toBe(result.source);
  expect(() =>
    applyJsonPatch({ value: 1 }, [{ op: 'test', path: '/value', value: 2 }]),
  ).toThrow();
});

test('rejects missing members and invalid array indexes', () => {
  const document = { values: ['one'], nested: {} };

  const subjects = [
    () => applyJsonPatch(document, [{ op: 'remove', path: '/missing' }]),
    () =>
      applyJsonPatch(document, [{ op: 'replace', path: '/missing', value: 1 }]),
    () =>
      applyJsonPatch(document, [
        { op: 'add', path: '/values/01', value: 'two' },
      ]),
    () =>
      applyJsonPatch(document, [
        { op: 'add', path: '/values/2', value: 'two' },
      ]),
    () =>
      applyJsonPatch(document, [
        { op: 'add', path: '/nested/missing/value', value: 1 },
      ]),
  ];

  subjects.forEach((subject) => expect(subject).toThrow());
});

test('rejects inherited properties while supporting an own __proto__ key', () => {
  const withPrototype = { value: 1 };
  const protoDocument = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(protoDocument, '__proto__', {
    configurable: true,
    enumerable: true,
    value: { safe: true },
    writable: true,
  });

  const result = applyJsonPatch(protoDocument as unknown as JsonValue, [
    { op: 'replace', path: '/__proto__/safe', value: false },
  ]) as Record<string, unknown>;

  expect(result['__proto__']).toEqual({ safe: false });
  expect(() =>
    applyJsonPatch(withPrototype, [
      { op: 'replace', path: '/toString', value: 1 },
    ]),
  ).toThrow();
});

test('does not mutate the input document or patch and commits no partial result', () => {
  const document = { first: 1, nested: { value: 'unchanged' } };
  const patch = [
    { op: 'replace', path: '/first', value: 2 },
    { op: 'remove', path: '/missing' },
  ];
  const patchBefore = JSON.parse(JSON.stringify(patch));

  expect(() => applyJsonPatch(document, patch)).toThrow();

  expect(document).toEqual({ first: 1, nested: { value: 'unchanged' } });
  expect(patch).toEqual(patchBefore);
});
