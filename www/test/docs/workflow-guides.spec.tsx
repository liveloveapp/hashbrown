import { expectConceptFirstWorkbench } from './concept-first-workbench';
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
      const lesson = demo === 'persistence' ? 'message-history' : demo;
      expectConceptFirstWorkbench(body, sdk, lesson);
    }
  },
);

test.each(SDKS)(
  '%s browser-storage recipe links the checked canonical client and bounded format',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'browser-history'])?.body ?? '';
    const file =
      sdk === 'react'
        ? 'react/src/HistoryWorkbench.tsx'
        : 'angular/src/app/history-workbench.ts';

    expect(body).toContain(file);
    expect(body).toContain('40 messages');
    expect(body).toContain('lastRunFinishReason');
    expect(body).toContain('canonical-workbench-save-text-conversations-');
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
