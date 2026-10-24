import { expect, test } from 'vitest';
import { docsMenuSections } from '../../src/components/menus/docs-menu.data';
import { listDocs, readDoc, SDKS } from '../../src/lib/content';
import { listSitemapEntries } from '../../src/lib/search-index';
import config from '../../next.config';

test('retired CopilotKit content is absent from docs and discovery', () => {
  const slugs = listDocs('react').map((slug) => slug.join('/'));

  const retired = readDoc('react', ['recipes', 'copilotkit']);

  expect(retired).toBeUndefined();
  expect(slugs).not.toContain('recipes/copilotkit');
  expect(
    listSitemapEntries().filter((entry) =>
      entry.url.includes('/recipes/copilotkit'),
    ),
  ).toEqual([]);
});

test.each(SDKS)(
  '%s navigation replaces CopilotKit with Threadplane and its migration',
  (sdk) => {
    const sections = docsMenuSections(sdk);

    const links = sections.flatMap((section) => section.links);

    expect(
      links.filter((link) => /copilotkit/i.test(link.text + link.href)),
    ).toEqual([]);
    expect(links).toContainEqual({
      text: 'Threadplane',
      href: `/docs/${sdk}/recipes/threadplane`,
    });
    expect(sections.at(-1)).toMatchObject({
      title: 'Migrations',
      collapsible: true,
    });
    expect(sections.at(-1)?.links).toContainEqual({
      text: 'Move chat to Threadplane',
      href: `/docs/${sdk}/migrations/threadplane`,
    });
  },
);

test('CopilotKit HTML and Markdown bookmarks permanently redirect to Threadplane', async () => {
  const redirects = await config.redirects?.();

  const retired = redirects?.filter((redirect) =>
    redirect.source.includes('/recipes/copilotkit'),
  );

  expect(retired).toEqual(
    ['', '.md'].map((extension) => ({
      source: `/docs/react/recipes/copilotkit${extension}`,
      destination: '/docs/react/recipes/threadplane',
      statusCode: 301,
    })),
  );
});
