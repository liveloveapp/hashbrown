import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { Element, Root } from 'hast';
import { readDoc } from '../src/lib/content';
import { parseMarkdown } from '../src/lib/markdown';
import {
  DOCS_REFERENCE_PAGES,
  WORKBENCH_FREE_PAGES,
} from '../src/components/workbench/workbench-page-lessons';
import { docsMenuSections } from '../src/components/menus/docs-menu.data';

for (const sdk of ['react', 'angular'] as const) {
  test(`${sdk} starter is discoverable and distinguishes published recovery from upcoming cold settlement`, () => {
    const file = `www/content/docs/${sdk}/platform/dotnet-starter.md`;
    const menu = docsMenuSections(sdk).flatMap((section) => section.links);

    expect(menu).toContainEqual({
      text: 'ASP.NET Core starter',
      href: `/docs/${sdk}/platform/dotnet-starter`,
    });
    const markdown = readFileSync(file, 'utf8');
    const table = markdown
      .split('## Published and upcoming compatibility')[1]
      ?.split('## Run the starter')[0];
    expect(table).toMatch(
      /`0\.8\.3`[^\n]+`0\.1\.0-preview\.1`[^\n]+no adoptable cold snapshot/,
    );
    expect(table).toMatch(
      /`0\.9\.0`[^\n]+`0\.1\.0-preview\.2`[^\n]+unreleased[^\n]+resumeConversationRecovery/,
    );
    for (const target of [
      'NativeSessionAgentFactory',
      'PostgresNativeSessionJournal',
    ]) {
      expect(markdown).toContain(`/api/dotnet/Hashbrown.AspNetCore.${target}`);
    }
    expect(markdown).toContain('INativeSessionBrowserRecoveryJournal');
    expect(markdown).toContain('NativeMaintenanceService.cs');
  });

  test(`${sdk} published guides keep exact preview.1 install commands while linking candidate onboarding`, () => {
    const pages = ['dotnet', 'dotnet-native-tools'].map((name) =>
      readFileSync(`www/content/docs/${sdk}/platform/${name}.md`, 'utf8'),
    );

    for (const markdown of pages) {
      const installs = [
        ...markdown.matchAll(
          /dotnet add package Hashbrown\.AspNetCore --version "\[([^\]]+)\]"/g,
        ),
      ];
      expect(installs.length).toBeGreaterThan(0);
      expect(installs.map((match) => match[1])).toEqual(
        installs.map(() => '0.1.0-preview.1'),
      );
      expect(markdown).toContain(`/docs/${sdk}/platform/dotnet-starter`);
      expect(markdown).toContain('0.9.0');
      expect(markdown).toContain('0.1.0-preview.2');
    }
  });
}

test('embedded package README retains usable preview.2 installation conditional on coordinated publication', () => {
  const markdown = readFileSync('packages/dotnet/README.md', 'utf8');
  const install = markdown
    .split('## Install the coordinated release')[1]
    ?.split('When testing an unpublished CI candidate')[0];

  expect(install).toMatch(/Once coordinated publication is complete/);
  expect(install).toContain('--version "[0.1.0-preview.2]"');
  expect(install).toContain('Version="[0.1.0-preview.2]"');
  expect(install).toContain('--locked-mode');
  expect(install).toContain('historical');
});

for (const sdk of ['react', 'angular'] as const) {
  test(`${sdk} .NET guide fragments resolve against actual rendered target heading IDs`, async () => {
    const pages = ['dotnet', 'dotnet-native-tools', 'dotnet-starter'];
    const parsed = new Map(
      await Promise.all(
        pages.map(async (name) => {
          const page = readDoc(sdk, ['platform', name]);
          if (!page) throw new Error(`Missing ${sdk}/${name}`);
          return [name, await parseMarkdown(page.body)] as const;
        }),
      ),
    );

    const checked: string[] = [];
    for (const [name, page] of parsed) {
      const links: string[] = [];
      const collect = (node: Root | Element): void => {
        for (const child of node.children) {
          if (child.type !== 'element') continue;
          if (
            child.tagName === 'a' &&
            typeof child.properties.href === 'string'
          ) {
            links.push(child.properties.href);
          }
          collect(child);
        }
      };
      collect(page.tree);
      for (const href of links) {
        const url = new URL(
          href,
          `https://hashbrown.dev/docs/${sdk}/platform/${name}`,
        );
        const prefix = `/docs/${sdk}/platform/`;
        const target =
          url.origin === 'https://hashbrown.dev' &&
          url.pathname.startsWith(prefix)
            ? parsed.get(url.pathname.slice(prefix.length))
            : undefined;
        if (!target || !url.hash) continue;
        const fragment = decodeURIComponent(url.hash.slice(1));

        expect(
          target.headings.map((heading) => heading.id),
          `${name}: ${href}`,
        ).toContain(fragment);
        checked.push(href);
      }
    }
    expect(checked.length).toBeGreaterThan(0);
  });
}

for (const sdk of ['react', 'angular'] as const) {
  test(`${sdk} starter labels its opening replay without claiming native server evidence`, () => {
    const body = readDoc(sdk, ['platform', 'dotnet-starter'])?.body ?? '';

    const opening = body.split('## Choose the composition')[0];

    expect(opening.split(/^# .+$/m)[1]?.trimStart()).toMatch(
      new RegExp(
        `^<hb-docs-demo demo="canonical-workbench-interrupts-${sdk}">`,
      ),
    );
    expect(opening).toContain('client replay');
    expect(opening).toContain(
      'does not run the ASP.NET Core starter, native .NET approvals or PostgreSQL session ownership',
    );
    expect(opening).toContain('<hb-diagram diagram="dotnet-agent-boundary">');
    expect(WORKBENCH_FREE_PAGES['platform/dotnet-starter']).toContain(
      'external application',
    );
    expect(DOCS_REFERENCE_PAGES['platform/dotnet-starter']).toBeUndefined();
    expect(body).not.toMatch(/<hb-workbench(?:-launcher)?\b/);
  });
}
