import * as s from './public_api';
import { PRIMITIVE_WRAPPER_FIELD_NAME } from './base';
import { descriptionToCamelCase, toJsonSchema } from './to-json-schema';

describe('descriptionToCamelCase', () => {
  test('converts description to camelCase', () => {
    expect(descriptionToCamelCase('Hello world')).toBe('helloWorld');
    expect(descriptionToCamelCase('  Title: With Punctuations!!  ')).toBe(
      'titleWithPunctuations',
    );
    expect(descriptionToCamelCase('123 starts with number')).toBe(
      '_123StartsWithNumber',
    );
    expect(descriptionToCamelCase('alreadyCamel')).toBe('alreadycamel');
  });
});

describe('toJsonSchema - root wrappers', () => {
  test('wraps primitive at root', () => {
    const schema = s.string('A string');
    const json = toJsonSchema(schema);

    expect(json).toEqual(
      expect.objectContaining({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        required: [PRIMITIVE_WRAPPER_FIELD_NAME],
        properties: expect.objectContaining({
          [PRIMITIVE_WRAPPER_FIELD_NAME]: expect.objectContaining({
            type: 'string',
          }),
        }),
      }),
    );
  });

  test('wraps array at root', () => {
    const schema = s.array('Arr', s.number('num'));
    const json = toJsonSchema(schema);

    expect(json).toEqual(
      expect.objectContaining({
        type: 'object',
        required: [PRIMITIVE_WRAPPER_FIELD_NAME],
        properties: expect.objectContaining({
          [PRIMITIVE_WRAPPER_FIELD_NAME]: expect.objectContaining({
            type: 'array',
            items: expect.objectContaining({ type: 'number' }),
          }),
        }),
      }),
    );
  });
});

describe('toJsonSchema - objects and defs', () => {
  test('object properties include children', () => {
    const schema = s.object('Root', {
      a: s.number('A'),
      b: s.string('B'),
    });
    const json = toJsonSchema(schema);
    expect(json).toEqual(
      expect.objectContaining({
        type: 'object',
        properties: expect.objectContaining({
          a: expect.objectContaining({ type: 'number' }),
          b: expect.objectContaining({ type: 'string' }),
        }),
        required: ['a', 'b'],
      }),
    );
  });

  test('repeated sub-schema goes into $defs with $ref', () => {
    const shared = s.object('Shared Item', { x: s.number('x') });
    const schema = s.object('Root', { a: shared, b: shared });

    const json = toJsonSchema(schema);

    // Expect a def created for the shared node
    expect(json.$defs).toBeDefined();
    const defKey = Object.keys(json.$defs)[0];
    expect(defKey).toBeDefined();
    expect(json.$defs[defKey]).toEqual(
      expect.objectContaining({
        type: 'object',
        properties: expect.objectContaining({ x: expect.any(Object) }),
      }),
    );

    // Both root properties should be $refs
    expect(json.properties.a).toEqual(
      expect.objectContaining({ $ref: `#/$defs/${defKey}` }),
    );
    expect(json.properties.b).toEqual(
      expect.objectContaining({ $ref: `#/$defs/${defKey}` }),
    );
  });
});

describe('toJsonSchema - anyOf', () => {
  test('anyOf with primitives is direct', () => {
    const schema = s.anyOf([s.number('N'), s.string('S')]);
    const json = toJsonSchema(schema);
    expect(json).toEqual(
      expect.objectContaining({
        anyOf: [
          expect.objectContaining({ type: 'number' }),
          expect.objectContaining({ type: 'string' }),
        ],
      }),
    );
  });

  test('anyOf with object options uses index wrappers by default', () => {
    const schema = s.anyOf([
      s.object('A', { a: s.number('a') }),
      s.object('B', { b: s.string('b') }),
    ]);
    const json = toJsonSchema(schema);

    // Expect wrappers keyed by indices
    expect(json.anyOf).toHaveLength(2);
    expect(json.anyOf[0]).toEqual(
      expect.objectContaining({
        type: 'object',
        required: ['0'],
        properties: expect.objectContaining({ '0': expect.any(Object) }),
      }),
    );
    expect(json.anyOf[1]).toEqual(
      expect.objectContaining({
        type: 'object',
        required: ['1'],
        properties: expect.objectContaining({ '1': expect.any(Object) }),
      }),
    );
  });

  test('anyOf with single literal per object uses literal-valued wrappers', () => {
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

    // Expect wrappers keyed by literal values
    const wrapperKeys = json.anyOf.map((x: any) => x.required[0]).sort();
    expect(wrapperKeys).toEqual(['app-button', 'app-markdown']);

    const appMarkdown = json.anyOf.find(
      (x: any) => x.required[0] === 'app-markdown',
    );
    const appButton = json.anyOf.find(
      (x: any) => x.required[0] === 'app-button',
    );

    expect(appMarkdown).toEqual(
      expect.objectContaining({
        type: 'object',
        properties: expect.objectContaining({
          'app-markdown': expect.any(Object),
        }),
      }),
    );
    expect(appButton).toEqual(
      expect.objectContaining({
        type: 'object',
        properties: expect.objectContaining({
          'app-button': expect.any(Object),
        }),
      }),
    );
  });
});
