import { expect, test } from 'vitest';
import { docsMenuSections } from '../../src/components/menus/docs-menu.data';
import { listDocs, readDoc, SDKS } from '../../src/lib/content';
import { listSitemapEntries } from '../../src/lib/search-index';

test.each(SDKS)(
  'the retired Remote MCP recipe is absent from %s content discovery',
  (sdk) => {
    const slugs = listDocs(sdk).map((slug) => slug.join('/'));

    const retired = readDoc(sdk, ['recipes', 'remote-mcp']);

    expect(retired).toBeUndefined();
    expect(slugs).not.toContain('recipes/remote-mcp');
    expect(readDoc(sdk, ['concept', 'functions'])).toBeDefined();
  },
);

test.each(SDKS)(
  'the %s menu retires Remote MCP and preserves Tool calling',
  (sdk) => {
    const links = docsMenuSections(sdk).flatMap((section) => section.links);

    const retired = links.filter(
      (link) => link.text === 'Remote MCP' || link.href.includes('/remote-mcp'),
    );

    expect(retired).toEqual([]);
    expect(links).toContainEqual({
      text: 'Tool calling',
      href: `/docs/${sdk}/concept/functions`,
    });
  },
);

test('search and LLM sitemap discovery omit retired Remote MCP recipes', () => {
  const entries = listSitemapEntries();

  const retired = entries.filter((entry) =>
    entry.url.includes('/recipes/remote-mcp'),
  );

  expect(retired).toEqual([]);
});
