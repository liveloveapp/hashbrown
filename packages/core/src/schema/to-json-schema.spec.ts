import * as s from './public_api';
import { PRIMITIVE_WRAPPER_FIELD_NAME } from './base';
import { descriptionToCamelCase, toJsonSchema } from './to-json-schema';

test('descriptionToCamelCase variants snapshot', () => {
  const samples = [
    'Hello world',
    '  Title: With Punctuations!!  ',
    '123 starts with number',
    'alreadyCamel',
    'kebab-case and snake_case',
    'multi    space\t and\nlines',
    'MiXeD CaSe Words',
  ];

  const result = Object.fromEntries(
    samples.map((x) => [x, descriptionToCamelCase(x)]),
  );

  expect(result).toMatchSnapshot();
});

test('root: wraps primitive string under __wrappedPrimitive', () => {
  const schema = s.string('A string');
  const json = toJsonSchema(schema);
  expect(json).toMatchSnapshot();
  expect(json.properties[PRIMITIVE_WRAPPER_FIELD_NAME]).toBeDefined();
});

test('root: wraps array under __wrappedPrimitive', () => {
  const schema = s.array('Arr', s.number('num'));
  const json = toJsonSchema(schema);
  expect(json).toMatchSnapshot();
});

test('object: properties, required, additionalProperties=false', () => {
  const schema = s.object('Root obj', {
    a: s.number('A'),
    b: s.string('B'),
  });
  const json = toJsonSchema(schema);
  expect(json).toMatchSnapshot();
});

test('defs: repeated sub-schema is extracted into $defs and referenced', () => {
  const shared = s.object('Shared Item', { x: s.number('x') });
  const schema = s.object('Root', { a: shared, b: shared });
  const json = toJsonSchema(schema);
  expect(json).toMatchSnapshot();
});

test('anyOf: primitives are direct without wrappers', () => {
  const schema = s.anyOf([s.number('N'), s.string('S')]);
  const json = toJsonSchema(schema);
  expect(json).toMatchSnapshot();
});

test('anyOf: object options are direct', () => {
  const schema = s.anyOf([
    s.object('A', { a: s.number('a') }),
    s.object('B', { b: s.string('b') }),
  ]);
  const json = toJsonSchema(schema);
  expect(json).toMatchSnapshot();
});

test('anyOf: mixed options are direct', () => {
  const schema = s.anyOf([
    s.string('S'),
    s.object('A', { a: s.number('a') }),
    s.number('N'),
  ]);
  const json = toJsonSchema(schema);
  expect(json).toMatchSnapshot();
});

test('anyOf: literal properties remain inside option objects', () => {
  const schema = s.anyOf([
    s.object('Show markdown', {
      $tagName: s.literal('app-markdown'),
      $props: s.object('Props', { data: s.string('data') }),
    }),
    s.object('Show button', {
      $tagName: s.literal('app-button'),
      $props: s.object('Props', { data: s.string('data') }),
    }),
  ]);
  const json = toJsonSchema(schema);
  expect(json).toMatchSnapshot();
  type SchemaWithProps = {
    properties?: Record<
      string,
      {
        properties?: Record<string, unknown>;
      }
    >;
  };
  const markdownOption = (json.anyOf as SchemaWithProps[] | undefined)?.find(
    (entry) => entry.properties?.['$tagName'],
  );
  expect(markdownOption?.properties?.['$tagName']).toBeDefined();
});

test('anyOf: duplicate literal values are direct', () => {
  const schema = s.anyOf([
    s.object('A', { type: s.literal('dup'), a: s.number('a') }),
    s.object('B', { type: s.literal('dup'), b: s.string('b') }),
  ]);
  const json = toJsonSchema(schema);
  expect(json).toMatchSnapshot();
});

test('anyOf: multiple literals per object are direct', () => {
  const schema = s.anyOf([
    s.object('A', { t1: s.literal('x'), t2: s.literal('y'), a: s.number('a') }),
    s.object('B', { t1: s.literal('p'), t2: s.literal('q'), b: s.string('b') }),
  ]);
  const json = toJsonSchema(schema);
  expect(json).toMatchSnapshot();
});
