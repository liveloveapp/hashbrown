import * as s from './public_api';
import { StreamSchemaParser } from '../streaming-json-parser/streaming-json-parser';
import { PRIMITIVE_WRAPPER_FIELD_NAME } from './base';

function parse(
  schema: s.HashbrownType,
  input: string,
  assumeFinishedMessage = false,
) {
  const parser = new StreamSchemaParser(schema);
  return parser.parse(input, assumeFinishedMessage);
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

test('Streaming array in non-streaming object emits elements incrementally', () => {
  const schema = s.object('root', {
    data: s.streaming.array('arr', s.number('num')),
  });

  expect(parse(schema, '{"data":[1')).toEqual({ data: [] });
  expect(parse(schema, '{"data":[1,')).toEqual({ data: [1] });
  expect(parse(schema, '{"data":[1,2,')).toEqual({ data: [1, 2] });
  expect(parse(schema, '{"data":[1,2,3]}')).toEqual({ data: [1, 2, 3] });
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

test('Extra data after valid JSON does not interrupt streaming', () => {
  const consoleMock = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);

  const schema = s.object('obj', { a: s.number('a') });

  expect(parse(schema, '{"a":1}garbage')).toEqual({ a: 1 });

  expect(consoleMock).not.toHaveBeenCalled();
});

test('Extra data after valid JSON will warn on the last message', () => {
  const consoleMock = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);

  const schema = s.object('obj', { a: s.number('a') });

  expect(parse(schema, '{"a":1}garbage', true)).toEqual({ a: 1 });
  expect(consoleMock).toHaveBeenCalledTimes(1);
  expect(consoleMock)
    .toHaveBeenLastCalledWith(`Extra data detected after parsing.\n
Parsed: {"a":1}\n
Left over: garbage\n
This is often caused by extra or incorrectly formatted data being returned by the 
LLM, despite requesting data with a particular structure.

Different models, by default, handle complex structured data with varied levels of accuracy.

Model behavior can typically be improved by:
- Adding 1-3 examples of correct output to your prompt (aka few-shot).
- Adding guardrails to the prompt like "Do not escape tool function arguments."
`);
});

describe('Wrapped primitives', () => {
  test('Boolean', () => {
    const schema = s.boolean('b');

    const result = parse(
      schema,
      JSON.stringify({
        [PRIMITIVE_WRAPPER_FIELD_NAME]: true,
      }),
    );

    expect(result).toBe(true);
  });

  test('String', () => {
    const schema = s.string('s');

    const result = parse(
      schema,
      JSON.stringify({
        [PRIMITIVE_WRAPPER_FIELD_NAME]: 'string value',
      }),
    );

    expect(result).toBe('string value');
  });

  test('Streaming string', () => {
    const schema = s.streaming.string('s');

    const result = parse(
      schema,
      JSON.stringify({
        [PRIMITIVE_WRAPPER_FIELD_NAME]: 'string value',
      }).slice(0, -5),
    );

    // Incomplete string is ok, since it is streaming
    expect(result).toBe('string va');
  });

  test('Array', () => {
    const schema = s.array('a', s.string('a.s'));

    const result = parse(
      schema,
      JSON.stringify({
        [PRIMITIVE_WRAPPER_FIELD_NAME]: ['string value'],
      }),
    );

    expect(result).toStrictEqual(['string value']);
  });
});

describe('anyOf', () => {
  test('anyOf flattened parsing', () => {
    const schema = s.object('root', {
      value: s.anyOf([s.number('num'), s.string('str')]),
    });
    const input = '{"value":123}';
    const input2 = '{"value":{"1":"hello"}}';

    expect(parse(schema, input)).toEqual({ value: 123 });
    expect(parse(schema, input2)).toEqual({ value: 'hello' });
  });

  test('anyOf envelope parsing across chunks (number branch)', () => {
    const schema = s.object('root', {
      value: s.anyOf([s.number('num'), s.string('str')]),
    });
    const chunk1 = '{"value":';
    const chunk2 = '123}';
    const combined = chunk1 + chunk2;

    expect(parse(schema, chunk1)).toBe('');
    expect(parse(schema, combined)).toEqual({ value: 123 });
  });

  test('anyOf envelope parsing across chunks (string branch)', () => {
    const schema = s.object('root', {
      value: s.anyOf([s.number('num'), s.streaming.string('str')]),
    });

    const chunk1 = '{"value":{"1":"he';
    const chunk2 = 'llo"}}';
    const combined = chunk1 + chunk2;

    expect(parse(schema, chunk1)).toEqual({ value: 'he' });
    expect(parse(schema, combined)).toEqual({ value: 'hello' });
  });

  test('object with anyOf of object', () => {
    const schema = s.object('outerObject', {
      element: s.anyOf([
        s.object('innerObject', {
          data: s.streaming.string('streaming data'),
        }),
      ]),
    });

    const chunk1 = '{"element":{"0":{"dat';
    const chunk2 = 'a":"streaming data"}}}';
    const combined = chunk1 + chunk2;

    expect(parse(schema, chunk1)).toEqual({
      element: {
        data: '',
      },
    });
    expect(parse(schema, combined)).toEqual({
      element: {
        data: 'streaming data',
      },
    });
  });

  test('streaming array with anyOf with mix of types', () => {
    const schema = s.streaming.array(
      'streaming array',
      s.anyOf([
        s.number('array number'),
        s.object('array object', {
          data: s.streaming.string('array object streaming data'),
        }),
        s.boolean('array boolean'),
      ]),
    );

    const chunk1 = '[{"1":{"data":"the ';
    const chunk2 = 'markdown data"}},17,';
    const chunk3 = 'false,12';
    const chunk4 = '3,{"1":{"data":"more markdown data"}}]';

    expect(parse(schema, chunk1)).toEqual([{ data: 'the' }]);
    expect(parse(schema, chunk1 + chunk2)).toEqual([
      { data: 'the markdown data' },
      17,
    ]);
    expect(parse(schema, chunk1 + chunk2 + chunk3)).toEqual([
      { data: 'the markdown data' },
      17,
      false,
    ]);
    expect(parse(schema, chunk1 + chunk2 + chunk3 + chunk4)).toEqual([
      { data: 'the markdown data' },
      17,
      false,
      123,
      { data: 'more markdown data' },
    ]);
  });

  test('ui client schema', () => {
    const schema = s.object('UI', {
      ui: s.streaming.array(
        'list of elements',
        s.anyOf([
          s.object('Show markdown to the user', {
            $tagName: s.literal('app-markdown'),
            $props: s.object('Props', {
              data: s.streaming.string('The markdown content'),
            }),
          }),
        ]),
      ),
    });

    const jsonString = JSON.stringify({
      ui: [
        {
          '0': {
            $tagName: 'app-markdown',
            $props: { data: 'Hello! How can I assist you today?' },
          },
        },
      ],
    });

    const chunk1 = jsonString.slice(0, 15);
    const chunk2 = jsonString.slice(15, 30);
    // Cross into the beginning of the data string
    const chunk3 = jsonString.slice(30, 60);
    // Return rest of data string
    const chunk4 = jsonString.slice(60);

    expect(parse(schema, chunk1)).toEqual({ ui: [] });
    expect(parse(schema, chunk1 + chunk2)).toEqual({ ui: [] });
    expect(parse(schema, chunk1 + chunk2 + chunk3)).toEqual({
      ui: [
        {
          $props: {
            data: 'Hel',
          },
          $tagName: 'app-markdown',
        },
      ],
    });
    expect(parse(schema, chunk1 + chunk2 + chunk3 + chunk4)).toEqual({
      ui: [
        {
          $props: {
            data: 'Hello! How can I assist you today?',
          },
          $tagName: 'app-markdown',
        },
      ],
    });
  });

  test('streaming array with anyOf with anyOf', () => {
    const schema = s.streaming.array(
      'streaming array',
      s.anyOf([
        s.anyOf([
          s.streaming.string('array object streaming data'),
          s.literal('anyOf anyOf literal'),
        ]),
        s.number('array number'),
        s.boolean('array boolean'),
      ]),
    );

    const data = [
      {
        '0': {
          '0': 'streaming string in inner anyOf',
        },
      },
      17,
      false,
      123,
      'anyOf anyOf literal',
    ];

    const asJson = JSON.stringify(data);

    expect(parse(schema, asJson)).toEqual([
      'streaming string in inner anyOf',
      17,
      false,
      123,
      'anyOf anyOf literal',
    ]);
  });

  test('streaming with multiple anyOfs in the schema', () => {
    const schema = s.object('root', {
      fieldA: s.anyOf([s.streaming.string(''), s.nullish()]),
      fieldB: s.anyOf([s.streaming.string(''), s.nullish()]),
    });

    const chunk1 = '{"fieldA":"hello","fieldB":';
    const chunk2 = 'null}';

    expect(parse(schema, chunk1)).toEqual({ fieldA: 'hello', fieldB: null });
    expect(parse(schema, chunk1 + chunk2)).toEqual({
      fieldA: 'hello',
      fieldB: null,
    });
  });

  test('using a literal in anyOf objects for customised discriminators', () => {
    const schema = s.object('root', {
      ui: s.streaming.array(
        'list of elements',
        s.anyOf([
          s.object('Show markdown to the user', {
            $tagName: s.literal('app-markdown'),
            $props: s.object('Props', {
              data: s.streaming.string('The markdown content'),
            }),
          }),
          s.object('Show a button to the user', {
            $tagName: s.literal('app-button'),
            $props: s.object('Props', {
              data: s.streaming.string('The button content'),
            }),
          }),
        ]),
      ),
    });

    const jsonString = JSON.stringify({
      ui: [
        {
          'app-markdown': {
            $props: { data: 'Hello! How can I assist you today?' },
          },
        },
      ],
    });

    expect(parse(schema, jsonString)).toEqual({
      ui: [
        {
          $props: { data: 'Hello! How can I assist you today?' },
          $tagName: 'app-markdown',
        },
      ],
    });
  });

  test('if missing a literal in an anyOf, default to using a numeric discriminator', () => {
    const schema = s.object('root', {
      ui: s.streaming.array(
        'list of elements',
        s.anyOf([
          s.object('Show markdown to the user', {
            $tagName: s.literal('app-markdown'),
          }),
          s.object('Show a button to the user', {
            $tagName: s.string('some string'),
          }),
        ]),
      ),
    });

    const jsonString = JSON.stringify({
      ui: [
        {
          '0': {
            $tagName: 'app-markdown',
          },
        },
      ],
    });

    expect(parse(schema, jsonString)).toEqual({
      ui: [
        {
          $tagName: 'app-markdown',
        },
      ],
    });
  });
});
