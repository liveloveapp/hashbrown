import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import {
  ApiResult,
  ApiResults,
  DocResult,
  DocResults,
} from '../../src/components/search/SearchResults';

test('doc results label a list of page links', () => {
  const html = renderToStaticMarkup(
    <DocResults>
      <DocResult
        url="/docs/react/concept/components"
        title="Components"
        subtitle="Expose components"
      />
    </DocResults>,
  );

  expect(html).toContain('DOCS');
  expect(html).toContain('href="/docs/react/concept/components"');
  expect(html).toContain('Components');
  expect(html).toContain('Expose components');
});

test('a doc result without a subtitle shows only the title', () => {
  const html = renderToStaticMarkup(
    <DocResult url="/docs/react/start/quick" title="Quick start" subtitle="" />,
  );

  expect(html).not.toContain('<span');
});

test('API results show the symbol, package and kind', () => {
  const html = renderToStaticMarkup(
    <ApiResults>
      <ApiResult
        url="/api/react/useUiChat"
        symbol="useUiChat"
        kind="Function"
        package="@hashbrownai/react"
      />
    </ApiResults>,
  );

  expect(html).toContain('API REFERENCES');
  expect(html).toContain('href="/api/react/useUiChat"');
  expect(html).toContain('useUiChat');
  expect(html).toContain('@hashbrownai/react');
  expect(html).toContain('Function');
});
