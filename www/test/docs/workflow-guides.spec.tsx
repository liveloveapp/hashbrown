import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { docsComponents } from '../../src/components/docs-components';
import { readDoc, SDKS } from '../../src/lib/content';
import { renderMarkdown } from '../../src/lib/markdown';

const workflows = [
  ['persistence', ['concept', 'message-history']],
  ['interrupts', ['concept', 'interrupt-and-resume']],
  ['shared-state', ['concept', 'shared-agent-state']],
  ['activities', ['concept', 'activities']],
  ['ui-kits', ['recipes', 'ui-kits']],
] as const;

test.each(workflows)(
  'renders the %s recording with its own accessible assets',
  async (demo) => {
    const result = await renderMarkdown(
      `<hb-docs-demo demo="${demo}">\n</hb-docs-demo>`,
      docsComponents('react'),
    );

    const html = renderToStaticMarkup(result.content);

    expect(html).toContain(`/video/docs/${demo}.webm`);
    expect(html).toContain(`/video/docs/${demo}-transcript.txt`);
    expect(html).toContain('scripted');
    expect(html).toContain('preload="none"');
    expect(html).not.toContain('ATC example');
  },
);

test.each(SDKS)(
  '%s workflow guides open with the behavior they teach',
  (sdk) => {
    const pages = workflows.map(([demo, slug]) => ({
      demo,
      body: readDoc(sdk, slug)?.body ?? '',
    }));

    for (const { demo, body } of pages) {
      const id = ['interrupts', 'shared-state', 'activities'].includes(demo)
        ? `canonical-workbench-${demo}-${sdk}`
        : demo;
      const media = body.indexOf(`<hb-docs-demo demo="${id}">`);

      expect(media, demo).toBeGreaterThan(-1);
      expect(media, demo).toBeLessThan(body.indexOf('\n## '));
    }
  },
);

test.each(SDKS)(
  '%s browser-storage recipe publishes the checked complete files',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'browser-history'])?.body ?? '';
    const files =
      sdk === 'react'
        ? ['src/text-history.ts', 'src/SavedConversations.tsx']
        : ['src/app/text-history.ts', 'src/app/saved-conversations.ts'];

    for (const file of files) {
      const section = body.slice(
        body.indexOf(`<hb-code-example header="${file}">`),
      );
      const snippet = section.match(/```[^\n]+\n([\s\S]*?)\n```/)?.[1];

      expect(snippet?.trim(), file).toBe(
        readFileSync(
          resolve(
            import.meta.dirname,
            `../../examples/quickstart/${sdk}/${file}`,
          ),
          'utf8',
        ).trim(),
      );
    }
  },
);

test.each(SDKS)(
  '%s history distinguishes thread identity from application-owned storage',
  (sdk) => {
    const body = readDoc(sdk, ['concept', 'message-history'])?.body ?? '';

    expect(body).toContain('not a message delta');
    expect(body).toContain('does not load or save');
    expect(body).toContain('runtime');
    expect(body).not.toContain('send only new message deltas');
    expect(body).not.toContain('send only message deltas');
  },
);
