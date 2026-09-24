import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ApiIndex } from '../../src/components/api/ApiIndex';
import {
  filterPackages,
  listKinds,
  toggleKind,
} from '../../src/components/api/api-index';
import type { MinimizedApiReport } from '../../src/lib/api-reference';
import { readApiReport } from '../../src/lib/api-reference';

const fixture: MinimizedApiReport = {
  packageNames: ['@hashbrownai/core', '@hashbrownai/react'],
  packages: {
    '@hashbrownai/core': {
      symbolNames: ['s', 'Chat', 'oldThing'],
      symbols: {
        s: {
          kind: 'Namespace',
          name: 's',
          canonicalReference: '@hashbrownai/core!s:namespace',
          isDeprecated: false,
        },
        Chat: {
          kind: 'Namespace',
          name: 'Chat',
          canonicalReference: '@hashbrownai/core!Chat:namespace',
          isDeprecated: false,
        },
        oldThing: {
          kind: 'Function',
          name: 'oldThing',
          canonicalReference: '@hashbrownai/core!oldThing:function',
          isDeprecated: true,
        },
      },
    },
    '@hashbrownai/react': {
      symbolNames: ['useChat', 'UseChatOptions'],
      symbols: {
        useChat: {
          kind: 'Function',
          name: 'useChat',
          canonicalReference: '@hashbrownai/react!useChat:function',
          isDeprecated: false,
        },
        UseChatOptions: {
          kind: 'Interface',
          name: 'UseChatOptions',
          canonicalReference: '@hashbrownai/react!UseChatOptions:interface',
          isDeprecated: false,
        },
      },
    },
  },
};

const names = (packages: ReturnType<typeof filterPackages>) =>
  packages.map((pkg) => [pkg.packageName, pkg.symbols.map((s) => s.name)]);

test('lists packages in report order and hides deprecated symbols', () => {
  const packages = filterPackages(fixture, '', '');

  expect(names(packages)).toEqual([
    ['@hashbrownai/core', ['s', 'Chat']],
    ['@hashbrownai/react', ['useChat', 'UseChatOptions']],
  ]);
});

test('narrows by kind and drops packages with no matches', () => {
  const packages = filterPackages(fixture, 'Interface', '');

  expect(names(packages)).toEqual([['@hashbrownai/react', ['UseChatOptions']]]);
});

test('narrows by a case-insensitive search term', () => {
  const packages = filterPackages(fixture, '', 'CHAT');

  expect(names(packages)).toEqual([
    ['@hashbrownai/core', ['Chat']],
    ['@hashbrownai/react', ['useChat', 'UseChatOptions']],
  ]);
});

test('combines kind and search', () => {
  const packages = filterPackages(fixture, 'Function', 'chat');

  expect(names(packages)).toEqual([['@hashbrownai/react', ['useChat']]]);
});

test('lists each kind once, in first-seen order', () => {
  const kinds = listKinds(fixture);

  expect(kinds).toEqual(['Namespace', 'Function', 'Interface']);
});

test('selecting the selected kind clears the filter', () => {
  const selected = toggleKind('', 'Function');
  const cleared = toggleKind(selected, 'Function');
  const switched = toggleKind(selected, 'Interface');

  expect(selected).toBe('Function');
  expect(cleared).toBe('');
  expect(switched).toBe('Interface');
});

test('renders every non-deprecated symbol in the report, grouped by package', () => {
  const report = readApiReport();

  const html = renderToStaticMarkup(<ApiIndex report={report} />);

  expect(html).toContain('<h1>API Reference</h1>');
  expect(html).toContain('placeholder="Search"');
  for (const packageName of report.packageNames) {
    expect(html).toContain(`<h2>${packageName}</h2>`);
    const pkg = packageName.replace('@hashbrownai/', '');
    for (const symbol of Object.values(report.packages[packageName].symbols)) {
      if (!symbol.isDeprecated) {
        expect(html).toContain(`href="/api/${pkg}/${symbol.name}"`);
      }
    }
  }
});

test('renders one kind chip per kind with its initial', () => {
  const html = renderToStaticMarkup(<ApiIndex report={fixture} />);

  expect(html).toContain('Filter by identifier type');
  expect(html).toMatch(/class="kind Namespace[^"]*"[^>]*>N<\/span> ?Namespace/);
  expect(html).toMatch(/class="kind Function[^"]*"[^>]*>F<\/span> ?useChat/);
});
