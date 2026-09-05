import {
  normalizeToolRejection,
  normalizeToolResult,
} from './normalize-tool-result';

test('preserves strings and serializes ordinary JSON tool results', () => {
  const values = ['already serialized', { temperature: 21 }, ['sunny', true]];

  const results = values.map(normalizeToolResult);

  expect(results).toEqual([
    'already serialized',
    '{"temperature":21}',
    '["sunny",true]',
  ]);
});

test('normalizes nullish, bigint, cyclic, and throwing tool results totally', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  const throwingGetter = Object.defineProperty({}, 'value', {
    enumerable: true,
    get() {
      throw new Error('cannot read');
    },
  });
  const coercionFailure = {
    toJSON() {
      throw new Error('cannot serialize');
    },
    toString() {
      throw new Error('cannot coerce');
    },
  };
  const hostileProxy = new Proxy(
    {},
    {
      get() {
        throw new Error('cannot access properties');
      },
    },
  );

  const results = [
    undefined,
    null,
    BigInt(42),
    cyclic,
    throwingGetter,
    coercionFailure,
    hostileProxy,
  ].map(normalizeToolResult);

  expect(results).toEqual([
    '',
    '',
    '42',
    '[object Object]',
    '[object Object]',
    '',
    '',
  ]);
});

test('normalizes error rejections by message without throwing on hostile values', () => {
  const hostileError = new Proxy(new Error('hidden'), {
    get(target, property, receiver) {
      if (property === 'message') {
        throw new Error('cannot access message');
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const hostileProxy = new Proxy(
    {},
    {
      get() {
        throw new Error('cannot access properties');
      },
      getPrototypeOf() {
        throw new Error('cannot access prototype');
      },
    },
  );

  const results = [
    new Error('tool failed'),
    { code: 503 },
    hostileError,
    hostileProxy,
  ].map(normalizeToolRejection);

  expect(results).toEqual(['tool failed', '{"code":503}', '{}', '']);
});

test('uses the ordinary value rules when an Error is fulfilled', () => {
  const result = normalizeToolResult(new Error('not a rejection'));

  expect(result).toBe('{}');
});
