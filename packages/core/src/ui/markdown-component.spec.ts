import { s } from '../schema';
import { markdownComponent } from './markdown-component';
import { createUiJsonSchema } from './ui-json-schema';

/** The Markdown definition exactly as Angular and React built it before this change. */
const TODAY = {
  name: 'Markdown',
  description: [
    'Render markdown content for the user.',
    '',
    'Write all markdown into the `children` prop.',
    'Use standard markdown for headings, lists, links, tables, and code blocks.',
  ].join('\n'),
  props: {
    children: s.node(s.streaming.string('Markdown content to render')),
  },
};

const CITATIONS = [
  'For citations, use inline references like `[^source-id]` and include matching definitions like `[^source-id]: Source title` or `[^source-id]: Source title https://example.com`.',
  'Citation numbers are assigned by first inline reference, and if an id is defined multiple times, only the first definition is used.',
].join('\n');

test('markdownComponent gives the model the same schema exposeMarkdown always has', () => {
  const definition = markdownComponent();

  const schema = createUiJsonSchema({ components: [definition] });

  expect(schema).toEqual(createUiJsonSchema({ components: [TODAY] }));
});

test('markdownComponent takes a custom name', () => {
  const definition = markdownComponent({ name: 'Answer' });

  expect(definition.name).toBe('Answer');
});

test('markdownComponent uses a custom description verbatim', () => {
  const definition = markdownComponent({
    description: 'Short answers only.',
    citations: true,
  });

  expect(definition.description).toBe('Short answers only.');
});

test('markdownComponent appends citation guidance to the default description', () => {
  const definition = markdownComponent({ citations: true });

  expect(definition.description).toBe(`${TODAY.description}\n${CITATIONS}`);
});

test('markdownComponent exposes only a streaming children prop', () => {
  const definition = markdownComponent();

  expect(Object.keys(definition.props ?? {})).toEqual(['children']);
});
