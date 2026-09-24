import { expect, test } from 'vitest';
import {
  listSymbolPages,
  listSymbols,
  loadFromCanonicalReference,
  loadReferenceData,
  readApiReport,
} from '../../src/lib/api-reference';

test('reads the minified API report with every package and symbol', () => {
  const report = readApiReport();

  expect(report.packageNames).toEqual([
    '@hashbrownai/angular',
    '@hashbrownai/core',
    '@hashbrownai/react',
  ]);
  expect(report.packages['@hashbrownai/react'].symbols['useChat']).toEqual({
    kind: 'Function',
    name: 'useChat',
    canonicalReference: '@hashbrownai/react!useChat:function',
    isDeprecated: false,
  });
});

test('serves every top-level symbol plus namespace members', () => {
  const pages = listSymbolPages();

  for (const symbol of listSymbols()) {
    expect(pages).toContainEqual(symbol);
  }
  expect(pages).toContainEqual({ pkg: 'core', symbol: 's.string' });
  expect(pages).toContainEqual({ pkg: 'core', symbol: 's.AnyOfType' });
  expect(pages).toContainEqual({
    pkg: 'core',
    symbol: 'Chat.Api.AssistantMessage',
  });
  expect(new Set(pages.map((p) => `${p.pkg}/${p.symbol}`)).size).toBe(
    pages.length,
  );
});

test('loads a top-level symbol unchanged', () => {
  const symbol = loadReferenceData('react', 'useChat');

  expect(symbol?.name).toBe('useChat');
  expect(symbol?.members).toHaveLength(1);
});

test('loads a namespace member, merging members that share its name', () => {
  const string = loadReferenceData('core', 's.string');
  const anyOfType = loadReferenceData('core', 's.AnyOfType');

  expect(string?.kind).toBe('Function');
  expect(string?.name).toBe('string');
  expect(string?.canonicalReference).toBe(
    '@hashbrownai/core!s.string:function(1)',
  );
  expect(anyOfType?.members.map((m) => m.kind)).toEqual([
    'Interface',
    'Variable',
  ]);
  expect(anyOfType?.isDeprecated).toBe(false);
});

test('loads members of a nested namespace', () => {
  const message = loadReferenceData('core', 'Chat.Api.AssistantMessage');

  expect(message?.kind).toBe('Interface');
  expect(message?.name).toBe('AssistantMessage');
});

test('returns undefined for unknown namespaces and members', () => {
  const unknownMember = loadReferenceData('core', 's.nope');
  const notANamespace = loadReferenceData('react', 'useChat.nope');
  const tooDeep = loadReferenceData('core', 'a.b.c.d');

  expect(unknownMember).toBeUndefined();
  expect(notANamespace).toBeUndefined();
  expect(tooDeep).toBeUndefined();
});

test('loads a symbol from its canonical reference', () => {
  const options = loadFromCanonicalReference(
    '@hashbrownai/react!UseChatOptions:interface',
  );
  const member = loadFromCanonicalReference(
    '@hashbrownai/core!s.string:function(1)',
  );
  const external = loadFromCanonicalReference('@angular/core!Signal:type');

  expect(options?.name).toBe('UseChatOptions');
  expect(member?.name).toBe('string');
  expect(external).toBeUndefined();
});
