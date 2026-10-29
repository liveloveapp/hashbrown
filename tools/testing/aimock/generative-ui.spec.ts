import {
  GENERATIVE_UI_PROMPT,
  generativeUiResponseSchema,
  parseGenerativeUi,
} from './generative-ui';

test('generativeUiResponseSchema nests metrics under a card through $defs', () => {
  const schema = generativeUiResponseSchema();

  expect(schema).toMatchObject({
    type: 'object',
    required: ['ui'],
    $defs: expect.any(Object),
  });
  expect(JSON.stringify(schema)).toContain('"$ref"');
});

test('GENERATIVE_UI_PROMPT asks for a card holding metrics', () => {
  const prompt = GENERATIVE_UI_PROMPT;

  const mentions = ['card', 'metric'].filter((word) => prompt.includes(word));

  expect(mentions).toEqual(['card', 'metric']);
});

test('parseGenerativeUi returns the card and its metrics', () => {
  const content = JSON.stringify({
    ui: [
      {
        card: {
          props: { title: 'Potatoes' },
          children: [
            { metric: { props: { label: 'Stock', value: 12 } } },
            { metric: { props: { label: 'Sold', value: 3 } } },
          ],
        },
      },
    ],
  });

  const ui = parseGenerativeUi(content);

  expect(ui).toEqual({
    title: 'Potatoes',
    metrics: [
      { label: 'Stock', value: 12 },
      { label: 'Sold', value: 3 },
    ],
  });
});

test('parseGenerativeUi rejects output that breaks the schema', () => {
  const content = JSON.stringify({
    ui: [{ card: { props: { title: 4 }, children: [] } }],
  });

  const parse = () => parseGenerativeUi(content);

  expect(parse).toThrow();
});

test('parseGenerativeUi rejects a response without a card', () => {
  const content = JSON.stringify({
    ui: [{ metric: { props: { label: 'Stock', value: 12 } } }],
  });

  const parse = () => parseGenerativeUi(content);

  expect(parse).toThrow('card');
});

test('parseGenerativeUi rejects a card without metrics', () => {
  const content = JSON.stringify({
    ui: [{ card: { props: { title: 'Potatoes' }, children: [] } }],
  });

  const parse = () => parseGenerativeUi(content);

  expect(parse).toThrow('metric');
});
