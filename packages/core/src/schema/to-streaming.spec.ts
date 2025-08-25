import { s } from './';
import { StreamSchemaParser } from '../streaming-json-parser';
import { HashbrownType } from './base';

test('it handles strings', () => {
  const schema = s.string('test');
  const input = 'test';

  const result = schema.toStreaming(input);
  const parsed = parseStreaming(schema, input);

  expect(result).toEqual(input);
  expect(parsed).toEqual(input);
});

test('it handles arrays', () => {
  const schema = s.streaming.array('some array', s.string('test'));
  const input = ['test', 'test2'];

  const result = schema.toStreaming(input);
  const parsed = parseStreaming(schema, input);

  expect(result).toEqual(input);
  expect(parsed).toEqual(input);
});

test('it handles objects', () => {
  const schema = s.streaming.object('some object', {
    name: s.string('name'),
  });
  const input = { name: 'test' };

  const result = schema.toStreaming(input);
  const parsed = parseStreaming(schema, input);

  expect(result).toEqual(input);
  expect(parsed).toEqual(input);
});

test('it handles nested objects', () => {
  const schema = s.streaming.object('some object', {
    name: s.string('name'),
    nested: s.streaming.object('nested object', {
      name: s.string('name'),
    }),
  });
  const input = { name: 'test', nested: { name: 'test2' } };

  const result = schema.toStreaming(input);
  const parsed = parseStreaming(schema, input);

  expect(result).toEqual(input);
  expect(parsed).toEqual(input);
});

test('it handles simple anyOf definitions', () => {
  const schema = s.streaming.object('some object', {
    name: s.anyOf([s.string('name'), s.number('name')]),
  });
  const input = { name: 'test' };

  const result = schema.toStreaming(input);
  const parsed = parseStreaming(schema, input);

  expect(result).toEqual(input);
  expect(parsed).toEqual(input);
});

test('it handles unkeyed objects in anyOf definitions', () => {
  const schema = s.streaming.array(
    'some array',
    s.anyOf([
      s.object('person', {
        personName: s.string('name'),
      }),
      s.object('pet', {
        petName: s.string('name'),
      }),
    ]),
  );
  const input = [{ personName: 'test' }];

  const result = schema.toStreaming(input);
  const parsed = parseStreaming(schema, result);

  expect(result).toEqual([
    {
      '0': {
        personName: 'test',
      },
    },
  ]);
  expect(parsed).toEqual(input);
});

test('it handles keyed objects in anyOf definitions', () => {
  const schema = s.streaming.array(
    'some object',
    s.anyOf([
      s.object('person', {
        type: s.literal('person'),
        personName: s.string('name'),
      }),
      s.object('pet', {
        type: s.literal('pet'),
        petName: s.string('name'),
      }),
    ]),
  );
  const input = [{ type: 'person' as const, personName: 'test' }];

  const result = schema.toStreaming(input);
  const parsed = parseStreaming(schema, result);

  expect(result).toEqual([
    {
      person: {
        personName: 'test',
      },
    },
  ]);
  expect(parsed).toEqual(input);
});

test('it handles nested anyOf definitions', () => {
  const schema = s.streaming.array(
    'some array',
    s.anyOf([
      s.object('person', {
        type: s.literal('person'),
        personName: s.string('name'),
        children: s.streaming.array(
          'children',
          s.anyOf([
            s.object('person', {
              type: s.literal('person'),
              personName: s.string('name'),
            }),
            s.object('pet', {
              type: s.literal('pet'),
              petName: s.string('name'),
            }),
          ]),
        ),
      }),
      s.object('pet', {
        type: s.literal('pet'),
        petName: s.string('name'),
      }),
    ]),
  );
  const input = [
    {
      type: 'person' as const,
      personName: 'test',
      children: [{ type: 'person' as const, personName: 'test' }],
    },
  ];

  const result = schema.toStreaming(input);
  const parsed = parseStreaming(schema, result);

  expect(result).toEqual([
    {
      person: {
        personName: 'test',
        children: [
          {
            person: {
              personName: 'test',
            },
          },
        ],
      },
    },
  ]);
  expect(parsed).toEqual(input);
});

function parseStreaming(schema: HashbrownType, input: unknown) {
  const parser = new StreamSchemaParser(schema);
  return parser.parse(JSON.stringify(input), true);
}
