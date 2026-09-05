import { cloneAndFreezeOptionalJsonValue } from './json-value';

test('returns JSON primitives unchanged and preserves an absent root', () => {
  const values = [undefined, null, true, false, 0, -1.5, '', 'hashbrown'];

  const results = values.map((value) => cloneAndFreezeOptionalJsonValue(value));

  expect(results).toEqual(values);
});

test('owns and recursively freezes nested arrays and plain objects', () => {
  const input = { list: [{ value: 1 }], nested: { enabled: true } };

  const result = cloneAndFreezeOptionalJsonValue(input) as {
    list: { value: number }[];
    nested: { enabled: boolean };
  };

  expect(result).toEqual(input);
  expect(result).not.toBe(input);
  expect(result.list).not.toBe(input.list);
  expect(result.list[0]).not.toBe(input.list[0]);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.list)).toBe(true);
  expect(Object.isFrozen(result.list[0])).toBe(true);
  expect(Object.isFrozen(result.nested)).toBe(true);
});

test('does not change when the caller later mutates the source', () => {
  const input = { nested: { value: 1 }, list: ['first'] };
  const result = cloneAndFreezeOptionalJsonValue(input);

  input.nested.value = 2;
  input.list.push('second');

  expect(result).toEqual({ nested: { value: 1 }, list: ['first'] });
});

test('preserves __proto__ as an own data key', () => {
  const input = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(input, '__proto__', {
    configurable: true,
    enumerable: true,
    value: { safe: true },
    writable: true,
  });

  const result = cloneAndFreezeOptionalJsonValue(input) as Record<
    string,
    unknown
  >;

  expect(Object.hasOwn(result, '__proto__')).toBe(true);
  expect(Object.getPrototypeOf(result)).toBeNull();
  expect(result['__proto__']).toEqual({ safe: true });
});

test('rejects invalid nested JSON values with their paths', () => {
  const sparse = [1];
  sparse.length = 3;
  sparse[2] = 3;
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  class Example {}

  const invalidValues: Array<[unknown, string]> = [
    [{ missing: undefined }, '$.missing'],
    [sparse, '$[1]'],
    [cyclic, '$.self'],
    [{ value: () => undefined }, '$.value'],
    [{ value: Symbol('value') }, '$.value'],
    [{ value: BigInt(1) }, '$.value'],
    [{ value: Number.NaN }, '$.value'],
    [{ value: Infinity }, '$.value'],
    [{ value: new Date() }, '$.value'],
    [{ value: new Map() }, '$.value'],
    [{ value: new Set() }, '$.value'],
    [{ value: new Example() }, '$.value'],
  ];

  const errors = invalidValues.map(
    ([value]) =>
      () =>
        cloneAndFreezeOptionalJsonValue(value),
  );

  errors.forEach((subject, index) => {
    expect(subject).toThrow(TypeError);
    expect(subject).toThrow(invalidValues[index][1]);
  });
});
