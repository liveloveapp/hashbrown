import { readFileSync } from 'node:fs';
import type { Root } from 'hast';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { expect, test } from 'vitest';
import { highlightCode, rehypeShiki } from '../src/lib/rehype-shiki';

const toHast = async (md: string) => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeShiki);
  return JSON.stringify((await processor.run(processor.parse(md))) as Root);
};

test('highlights fenced code with the hashbrown theme', async () => {
  const tree = await toHast('```ts\nconst a = 1;\n```');

  expect(tree).toContain('"class":"shiki hashbrown"');
  expect(tree).toContain('color:');
});

test('highlights the languages the docs use through their aliases', async () => {
  const tree = await toHast(
    '```sh\nnpm install\n```\n\n```json\n{"a": 1}\n```',
  );

  expect(tree).not.toContain('language-sh');
  expect(tree.match(/"class":"shiki hashbrown"/g)?.length).toBe(2);
});

test('falls back to plain text for unknown languages instead of failing', async () => {
  const tree = await toHast('```nope\nhello\n```');

  expect(tree).toContain('"class":"shiki hashbrown"');
  expect(tree).toContain('hello');
});

test('keeps angle brackets inside code as text nodes', async () => {
  const tree = await toHast(
    '```html\n<hb-render-message [message]="m" />\n```',
  );

  expect(tree).not.toContain('"tagName":"hb-render-message"');
  expect(tree).toContain('hb-render-message');
});

test('marks the highlighted pre with the language actually used', async () => {
  const known = await toHast('```ts\nconst a = 1;\n```');
  const unknown = await toHast('```nope\nhello\n```');

  expect(known).toContain('"dataLanguage":"typescript"');
  expect(unknown).toContain('"dataLanguage":"text"');
});

for (const language of ['csharp', 'cs', 'c#']) {
  test(`highlights fenced ${language} as C# with distinct syntax colors`, async () => {
    const markdown = `\`\`\`${language}\npublic class Message { public string Text = "Hello"; }\n\`\`\``;

    const tree = await toHast(markdown);
    const colors = new Set(
      [...tree.matchAll(/"style":"color:([^";]+)/g)].map((match) => match[1]),
    );

    expect(tree).toContain('"dataLanguage":"csharp"');
    expect(colors.size).toBeGreaterThan(1);
  });
}

test('highlights fenced XML with distinct syntax colors and preserves markup as text', async () => {
  const markdown =
    '```xml\n<Project Sdk="Microsoft.NET.Sdk">Hello</Project>\n```';

  const tree = await toHast(markdown);
  const colors = new Set(
    [...tree.matchAll(/"style":"color:([^";]+)/g)].map((match) => match[1]),
  );

  expect(tree).toContain('"dataLanguage":"xml"');
  expect(colors.size).toBeGreaterThan(1);
  expect(tree).not.toContain('"tagName":"Project"');
  expect(tree).toContain('Microsoft.NET.Sdk');
});

for (const language of ['csharp', 'cs', 'c#']) {
  test(`highlightCode supports ${language} with distinct syntax colors`, async () => {
    const code = 'public class Message { public string Text = "Hello"; }';

    const html = await highlightCode(code, language);
    const colors = new Set(
      [...html.matchAll(/<span style="color:([^";]+)/g)].map(
        (match) => match[1],
      ),
    );

    expect(html).toContain('class="shiki hashbrown"');
    expect(colors.size).toBeGreaterThan(1);
  });
}

test('highlightCode rejects unknown languages', async () => {
  const code = 'hello';

  const highlighted = highlightCode(code, 'nope');

  await expect(highlighted).rejects.toThrow();
});

for (const sdk of ['react', 'angular']) {
  for (const name of ['dotnet', 'dotnet-native-tools']) {
    test(`renders intact C# and XML with distinct colors for ${sdk}/${name}`, async () => {
      const markdown = readFileSync(
        `www/content/docs/${sdk}/platform/${name}.md`,
        'utf8',
      );
      const blocks = [
        ...markdown.matchAll(/```(csharp|xml)\n([\s\S]*?)\n```/g),
      ];

      for (const [, language, code] of blocks) {
        const html = await highlightCode(code, language);
        const colors = new Set(
          [...html.matchAll(/<span style="color:([^";]+)/g)].map(
            (match) => match[1],
          ),
        );
        const tree = JSON.parse(
          await toHast(`\`\`\`${language}\n${code}\n\`\`\``),
        );
        const text = (node: {
          type: string;
          value?: string;
          children?: unknown[];
        }): string =>
          node.type === 'text'
            ? (node.value ?? '')
            : (node.children ?? [])
                .map((child) => text(child as Parameters<typeof text>[0]))
                .join('');

        expect(colors.size).toBeGreaterThan(1);
        expect(text(tree).trim()).toBe(code.trim());
      }
      expect(blocks.some(([, language]) => language === 'xml')).toBe(true);
      expect(blocks.some(([, language]) => language === 'csharp')).toBe(true);
      expect(markdown).toContain('not published to NuGet.org');
    });
  }
}
