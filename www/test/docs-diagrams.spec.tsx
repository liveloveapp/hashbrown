import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { docsComponents } from '../src/components/docs-components';
import {
  DiagramFigure,
  DocsDiagram,
} from '../src/components/diagrams/DocsDiagram';
import {
  type DiagramDefinition,
  validateDiagram,
} from '../src/components/diagrams/diagram-types';
import { renderMarkdown } from '../src/lib/markdown';
import { DOCS_DIAGRAMS } from '../src/components/diagrams/diagram-catalog';
import {
  nodeMetrics,
  wrapLabel,
} from '../src/components/diagrams/diagram-types';

const graph: DiagramDefinition = {
  kind: 'architecture',
  title: 'A request crosses an application boundary',
  caption: 'The server checks access before calling the provider.',
  description:
    'The browser sends a request to the server. The server checks access.',
  width: 720,
  height: 230,
  nodes: [
    {
      id: 'browser',
      x: 24,
      y: 72,
      width: 240,
      title: 'Browser',
      detail: 'Owns rendering',
    },
    {
      id: 'server',
      x: 432,
      y: 72,
      width: 264,
      title: 'Application server',
      detail: 'Checks access',
    },
  ],
  edges: [
    {
      from: 'browser',
      to: 'server',
      points: [
        [264, 122],
        [432, 122],
      ],
      label: { text: 'request', x: 348, y: 106 },
    },
  ],
};

test('renders a labeled static SVG, caption and equivalent text without a client graph runtime', () => {
  const html = renderToStaticMarkup(
    <DiagramFigure definition={graph} id="test-boundary" />,
  );
  expect(html).toContain('<figure');
  expect(html).toContain('<svg');
  expect(html).toContain('role="img"');
  expect(html).toContain('Application server');
  expect(html).toContain('request');
  expect(html).toContain('<figcaption');
  expect(html).toContain('Read the diagram');
  expect(html).toContain(graph.description);
  expect(html).toContain('Expand diagram');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('foreignObject');
});

test('multiple server-rendered instances have unique accessible control IDs', () => {
  const html = renderToStaticMarkup(
    <>
      <DiagramFigure definition={graph} id="one" />
      <DiagramFigure definition={graph} id="two" />
    </>,
  );
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
});

test('the modal contains the equivalent description while the surrounding figure is inert', () => {
  const html = renderToStaticMarkup(
    <DiagramFigure definition={graph} id="modal-description" />,
  );
  const dialog = html.split('<dialog')[1].split('</dialog>')[0];
  expect(dialog).toContain(graph.description);
  expect(dialog).toContain('Read the diagram');
});

test('renders a sequence in order and rejects an unknown participant', () => {
  const sequence: DiagramDefinition = {
    kind: 'sequence',
    title: 'A response returns to the caller',
    caption: 'Time moves down.',
    description: 'A calls B. B returns a result.',
    participants: [
      { id: 'a', title: 'Client' },
      { id: 'b', title: 'Server' },
    ],
    messages: [
      { from: 'a', to: 'b', label: 'Request' },
      { from: 'b', to: 'a', label: 'Result', dashed: true },
    ],
  };
  const html = renderToStaticMarkup(
    <DiagramFigure definition={sequence} id="sequence" />,
  );
  expect(html.indexOf('Request')).toBeLessThan(html.indexOf('Result'));
  expect(() =>
    validateDiagram({
      ...sequence,
      messages: [{ from: 'missing', to: 'b', label: 'Request' }],
    }),
  ).toThrow(/participant/i);
});

test('invalid connections and off-canvas content fail instead of producing a misleading diagram', () => {
  expect(() =>
    validateDiagram({
      ...graph,
      edges: [
        {
          from: 'browser',
          to: 'missing',
          points: [
            [264, 122],
            [432, 122],
          ],
        },
      ],
    }),
  ).toThrow(/node/i);
  expect(() =>
    validateDiagram({ ...graph, nodes: [{ ...graph.nodes[0], x: -20 }] }),
  ).toThrow(/bounds/i);
  expect(() =>
    validateDiagram({ ...graph, nodes: [graph.nodes[0], graph.nodes[0]] }),
  ).toThrow(/duplicate/i);
});

test('renders a registered diagram at block level through the actual docs Markdown pipeline', async () => {
  const { content } = await renderMarkdown(
    '<hb-diagram diagram="request-boundary"> </hb-diagram>',
    docsComponents('react'),
  );
  const html = renderToStaticMarkup(content);
  expect(html).toContain('data-diagram="request-boundary"');
  expect(html).not.toMatch(/<p[^>]*>\s*<figure/);
  expect(html).not.toContain('data-unported');
});

test.each([
  'Before <hb-diagram diagram="request-boundary"></hb-diagram> after.',
  '**<hb-diagram diagram="request-boundary"></hb-diagram>**',
])('rejects diagrams embedded in phrasing content: %s', async (source) => {
  await expect(renderMarkdown(source, docsComponents('react'))).rejects.toThrow(
    /own paragraph/,
  );
});

test('unknown diagram IDs fail visibly', () => {
  expect(() => renderToStaticMarkup(<DocsDiagram diagram="missing" />)).toThrow(
    'Unknown documentation diagram: missing',
  );
});

test('invalid text-layout widths fail immediately rather than hanging the build', () => {
  expect(() => wrapLabel('label', 0)).toThrow(/positive integer/);
  expect(() => wrapLabel('label', -1)).toThrow(/positive integer/);
  expect(() =>
    nodeMetrics({ id: 'small', x: 0, y: 0, title: 'Small', width: 40 }),
  ).toThrow(/at least 160/);
});

test.each(Object.entries(DOCS_DIAGRAMS))(
  '%s has valid geometry and server-rendered accessible content',
  (id, definition) => {
    expect(() => validateDiagram(definition)).not.toThrow();
    const html = renderToStaticMarkup(<DocsDiagram diagram={id} />);
    expect(html).toContain('Read the diagram');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  },
);

test('long labels wrap without losing a field name or overflowing the measured node height', () => {
  const word = 'anUnusuallyLongApplicationIdentifier';
  const lines = wrapLabel(word, 12);
  expect(lines.join('')).toBe(word);
  expect(lines.every((line) => line.length <= 12)).toBe(true);
  const metrics = nodeMetrics({
    id: 'long',
    x: 0,
    y: 0,
    width: 220,
    title: 'An unusually long application boundary',
    detail: 'A description that needs several readable lines.',
  });
  expect(metrics.titles.length).toBeGreaterThan(1);
  expect(metrics.height).toBeGreaterThan(120);
});

test('long sequence messages wrap between adjacent participants', () => {
  const definition: DiagramDefinition = {
    kind: 'sequence',
    title: 'A named handoff',
    caption: 'A request and response.',
    description: 'The client supplies the complete request to the server.',
    participants: [
      { id: 'client', title: 'Client' },
      { id: 'server', title: 'Server' },
    ],
    messages: [
      {
        from: 'client',
        to: 'server',
        label:
          'A long request label should wrap inside the space between adjacent participants instead of escaping the diagram',
      },
    ],
  };
  const html = renderToStaticMarkup(
    <DiagramFigure definition={definition} id="long-sequence" />,
  );
  expect((html.match(/<tspan\b/g) ?? []).length).toBeGreaterThanOrEqual(6);
});
