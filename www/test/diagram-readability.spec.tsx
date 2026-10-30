import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DiagramCanvas } from '../src/components/diagrams/DiagramCanvas';
import { DOCS_DIAGRAMS } from '../src/components/diagrams/diagram-catalog';

for (const [id, definition] of Object.entries(DOCS_DIAGRAMS)) {
  test(`${id} fits an article at its natural text size`, () => {
    const html = renderToStaticMarkup(
      <DiagramCanvas definition={definition} />,
    );
    const width = Number(html.match(/viewBox="0 0 ([\d.]+)/)?.[1]);
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(740);
    expect(html).toContain(`max-width:${width}px`);
  });
}
