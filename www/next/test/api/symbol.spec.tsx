import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Symbol } from '../../src/components/api/Symbol';
import { SymbolPopoverContent } from '../../src/components/api/SymbolPopoverContent';
import { buildSymbolContext } from '../../src/components/api/symbol-context';
import type { ApiSymbol } from '../../src/lib/api-reference';
import { loadReferenceData } from '../../src/lib/api-reference';
import { docs, member, summary } from './fixtures';

const load = (pkg: string, symbol: string): ApiSymbol => {
  const data = loadReferenceData(pkg, symbol);
  if (!data) {
    throw new Error(`missing ${pkg}/${symbol}`);
  }
  return data;
};

const textOf = (html: string) => html.replace(/<[^>]+>/g, '');

const renderSymbol = async (data: ApiSymbol, pkg = 'react') => {
  const context = await buildSymbolContext(data, pkg);
  return renderToStaticMarkup(<Symbol summary={data} context={context} />);
};

test('renders the header, summary and source link of a function', async () => {
  const data = load('react', 'useChat');

  const html = await renderSymbol(data);

  expect(html).toMatch(/<h1[^>]*>useChat<\/h1>/);
  expect(html).toContain('This React hook creates a chat instance');
  expect(html).toContain(
    'href="https://github.com/liveloveapp/hashbrown/blob/main/packages/react/src/hooks/use-chat.ts"',
  );
});

test('links public references in the signature and leaves private ones as text', async () => {
  const data = load('react', 'useChat');

  const html = await renderSymbol(data);

  expect(html).toContain('<h2>API</h2>');
  expect(html).toContain('href="/api/react/UseChatOptions"');
  expect(html).toContain('href="/api/react/UseChatResult"');
  expect(html).not.toContain('AnyTool"');
  expect(textOf(html)).toContain('Chat.AnyTool');
});

test('wraps linked references in a popover trigger', async () => {
  const data = load('react', 'useChat');

  const html = await renderSymbol(data);

  expect(html).toMatch(
    /data-symbol-popover="@hashbrownai\/react!UseChatOptions:interface"[^>]*><a[^>]*href="\/api\/react\/UseChatOptions"/,
  );
});

test('renders params, type params, returns and examples', async () => {
  const data = load('react', 'useChat');

  const html = await renderSymbol(data);

  expect(html).toContain('@param');
  expect(html).toContain('options:');
  expect(html).toContain('@type');
  expect(html).toMatch(/<code[^>]*>Tools<\/code>/);
  expect(html).toContain('@returns');
  expect(html).toContain('<h2>Examples</h2>');
  expect(html).toContain('MyChatComponent');
  expect(html).toContain('class="shiki hashbrown"');
});

test('links Angular references to angular.dev', async () => {
  const data = load('angular', 'ChatResourceRef');

  const html = await renderSymbol(data, 'angular');

  expect(html).toContain('href="https://angular.dev/api/core/Resource"');
  expect(html).toContain('target="_blank"');
});

test('lists interface members with anchors and method panels', async () => {
  const data = load('angular', 'ChatResourceRef');

  const html = await renderSymbol(data, 'angular');

  expect(html).toContain('href="#isLoading"');
  expect(html).toContain('id="isLoading"');
  expect(textOf(html)).toContain('interface ChatResourceRef');
});

test('renders a namespace as a header plus symbol chips per member', async () => {
  const data = load('core', 's');

  const html = await renderSymbol(data, 'core');

  expect(html).toMatch(/<h1[^>]*>s<\/h1>/);
  expect(html).toContain('href="/api/core/s.string"');
  expect(html).toMatch(/class="kind Function[^"]*"[^>]*>F<\/span> ?string/);
});

test('renders a namespace member page', async () => {
  const data = load('core', 's.string');

  const html = await renderSymbol(data, 'core');

  expect(html).toMatch(/<h1[^>]*>string<\/h1>/);
  expect(html).toContain('<h2>API</h2>');
});

test('renders usage notes, parameter docs and a deprecated chip', async () => {
  const data = summary([
    member({
      kind: 'Function',
      name: 'oldThing',
      canonicalReference: '@hashbrownai/core!oldThing:function',
      formattedContent:
        'export declare function oldThing(value: string): void;',
      excerptTokens: [
        { kind: 'Content', text: 'export declare function oldThing(value: ' },
        { kind: 'Content', text: 'string' },
        { kind: 'Content', text: '): ' },
        { kind: 'Content', text: 'void' },
        { kind: 'Content', text: ';' },
      ],
      parameters: [
        {
          parameterName: 'value',
          isOptional: true,
          parameterTypeTokenRange: { startIndex: 1, endIndex: 2 },
        },
      ],
      returnTypeTokenRange: { startIndex: 3, endIndex: 4 },
      docs: docs({
        summary: 'Does an old thing.',
        deprecated: 'Use newThing instead.',
        usageNotes: 'Call it **once**.',
        params: [{ name: 'value', description: 'The `value` to use.' }],
      }),
    }),
  ]);

  const html = await renderSymbol(data, 'core');

  expect(html).toMatch(/<h1 class="[^"]*deprecated[^"]*">oldThing<\/h1>/);
  expect(html).toMatch(/title="Use newThing instead\."[^>]*>Deprecated</);
  expect(html).toContain('@optional');
  expect(html).toContain('value:');
  expect(html).toContain('The <code>value</code> to use.');
  expect(html).toMatch(/<h2[^>]*>@usageNotes<\/h2>/);
  expect(html).toContain('<strong>once</strong>');
});

test('orders deprecated members last and marks them', async () => {
  const data = summary([
    member({
      kind: 'Interface',
      name: 'Options',
      excerptTokens: [{ kind: 'Content', text: 'export interface Options' }],
      members: [
        member({
          kind: 'PropertySignature',
          name: 'legacy',
          formattedContent: 'legacy: string;',
          excerptTokens: [
            { kind: 'Content', text: 'legacy: ' },
            { kind: 'Content', text: 'string' },
            { kind: 'Content', text: ';' },
          ],
          docs: docs({ deprecated: 'Gone soon.' }),
        }),
        member({
          kind: 'PropertySignature',
          name: 'current',
          formattedContent: 'current: string;',
          excerptTokens: [
            { kind: 'Content', text: 'current: ' },
            { kind: 'Content', text: 'string' },
            { kind: 'Content', text: ';' },
          ],
        }),
      ],
    }),
  ]);

  const html = await renderSymbol(data, 'core');

  expect(html.indexOf('id="current"')).toBeLessThan(
    html.indexOf('id="legacy"'),
  );
  expect(html.indexOf('href="#current"')).toBeLessThan(
    html.indexOf('href="#legacy"'),
  );
  expect(html).toMatch(/title="Gone soon\."[^>]*>Deprecated</);
});

test('renders popover content without nested links', async () => {
  const data = load('react', 'UseChatOptions');
  const context = await buildSymbolContext(data, 'react', { links: false });

  const html = renderToStaticMarkup(
    <SymbolPopoverContent summary={data} context={context} />,
  );

  expect(html).toMatch(/<h1[^>]*>UseChatOptions<\/h1>/);
  expect(html).toContain('<h2>API</h2>');
  expect(html).not.toContain('data-symbol-popover');
  expect(html).not.toContain('href="#');
});
