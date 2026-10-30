import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import {
  CONCEPT_DIAGRAMS,
  ConceptDiagram,
} from '../src/components/elements/ConceptDiagram';
import { docsComponents } from '../src/components/docs-components';
import { renderMarkdown } from '../src/lib/markdown';

test.each(Object.keys(CONCEPT_DIAGRAMS))(
  'renders the %s flow as readable ordered steps',
  (concept) => {
    const diagram = CONCEPT_DIAGRAMS[concept as keyof typeof CONCEPT_DIAGRAMS];

    const html = renderToStaticMarkup(<ConceptDiagram concept={concept} />);

    expect(html).toContain('<figure');
    expect(html).toContain('<ol');
    expect(html.match(/<li\b/g)).toHaveLength(diagram.steps.length);
    expect(html).toContain('<figcaption>');
    expect(html).toContain(diagram.caption);
    for (const step of diagram.steps) expect(html).toContain(step.title);
    expect(html).not.toContain('<script');
  },
);

test('rejects an unknown concept instead of silently rendering an empty diagram', () => {
  expect(() =>
    renderToStaticMarkup(<ConceptDiagram concept="unknown" />),
  ).toThrow('Unknown concept diagram: unknown');
});

test('renders the concept element through the documentation markdown map', async () => {
  const source = '<hb-concept-diagram concept="tools"></hb-concept-diagram>';

  const { content } = await renderMarkdown(source, docsComponents('react'));
  const html = renderToStaticMarkup(content);

  expect(html).not.toMatch(/<p[^>]*>\s*<figure/);
  expect(html).toContain('data-concept="tools"');
  expect(html).toContain('Tool result');
  expect(html).not.toContain('data-unported');
});

test.each([
  'Before <hb-concept-diagram concept="tools"></hb-concept-diagram> after.',
  '**<hb-concept-diagram concept="tools"></hb-concept-diagram>**',
])('rejects a diagram embedded in a phrasing paragraph: %s', async (source) => {
  await expect(renderMarkdown(source, docsComponents('react'))).rejects.toThrow(
    'Concept diagrams must occupy their own paragraph',
  );
});
