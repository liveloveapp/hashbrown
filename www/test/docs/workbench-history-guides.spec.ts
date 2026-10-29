import { expectConceptFirstWorkbench } from './concept-first-workbench';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';
import { DOCS_DEMOS } from '../../src/components/elements/docs-demo-media';

const lessons = [
  ['concept', 'message-history', 'message-history'],
  ['recipes', 'browser-history', 'save-text-conversations'],
] as const;

test.each(SDKS)(
  '%s overview lists both history lessons and distinguishes conversation identity',
  (sdk) => {
    const overview = readDoc(sdk, ['start', 'workbench'])?.body ?? '';
    const history = readDoc(sdk, ['concept', 'message-history'])?.body ?? '';

    expect(overview).toContain(
      `| [Message history](/docs/${sdk}/concept/message-history)`,
    );
    expect(overview).toContain(
      `| [Save text conversations](/docs/${sdk}/recipes/browser-history)`,
    );
    expect(history).toContain('opaque conversation identity');
    expect(history).not.toContain('opaque run identity');
  },
);

test.each(SDKS)(
  '%s server-storage guide links its checked canonical text codec directly',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'threads'])?.body ?? '';
    const file = 'runtime/workbench-history.ts';

    expect(body).toContain(
      `https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/${file}`,
    );
    expect(body).not.toContain("Keep that guide's `text-history.ts`");
    expect(
      readFileSync(
        resolve(import.meta.dirname, '../../examples/quickstart', file),
        'utf8',
      ),
    ).toContain('export function decodeWorkbenchHistory');
  },
);

test.each(SDKS)(
  '%s history media identify actual provider footage and the text boundary',
  (sdk) => {
    for (const [, , lesson] of lessons) {
      const id = `canonical-workbench-${lesson}-${sdk}`;
      const media = DOCS_DEMOS[id as keyof typeof DOCS_DEMOS];
      const recording = media && 'recording' in media ? media.recording : '';

      expect(media, id).toBeDefined();
      expect(media).toHaveProperty('dimensions', { width: 1600, height: 1000 });
      expect(recording).toContain('OpenAI');
      expect(recording).toContain('completed text');
      expect(recording).toContain('Replay');
    }
  },
);

test.each(SDKS)(
  '%s history guides teach the canonical plan with matching media',
  (sdk) => {
    for (const [section, slug, lesson] of lessons) {
      const body = readDoc(sdk, [section, slug])?.body ?? '';
      const id = `canonical-workbench-${lesson}-${sdk}`;
      expectConceptFirstWorkbench(body, sdk, lesson);
      expect(body).toContain(`/video/docs/${id}-result.png`);
      expect(body).toContain(`/${sdk}.html?lesson=${lesson}`);
      expect(body).toContain(`/docs/${sdk}/start/workbench`);
      expect(body).toContain('two-step plan');
      expect(body).toContain('Lighthouse');
      expect(body).toContain('setMessages');
      expect(body).not.toMatch(
        /demo="persistence"|My name is Sam|Personal and Work/,
      );
    }
  },
);

test.each(SDKS)(
  '%s history guide explains replacement and generation separately',
  (sdk) => {
    const body = readDoc(sdk, ['concept', 'message-history'])?.body ?? '';

    expect(body).toContain('Keep completed text');
    expect(body).toContain('Clear messages');
    expect(body).toContain('Restore kept text');
    expect(body).toMatch(/final|last/);
    expect(body).toContain('user');
    expect(body).toContain('initial');
    expect(body).toContain('threadId');
    expect(body).toContain('checkpoint');
  },
);

test.each(SDKS)(
  '%s saved text guide requires confirmed completion and explicit storage',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'browser-history'])?.body ?? '';

    expect(body).toContain('Harbor');
    expect(body).toContain('lastRunFinishReason');
    expect(body).toContain('stop');
    expect(body).toContain('40 messages');
    expect(body).toContain('2,000');
    expect(body).toContain('64,000');
    expect(body).toContain('UTF-8');
    expect(body).toContain('version: 1');
    expect(body).toMatch(/invalid|unknown/);
    expect(body).toContain('refresh');
    expect(body).toContain('checkpoint');
    expect(body).not.toContain('so a partial response does not replace');
  },
);

test.each(SDKS)('%s history excerpts match checked source', (sdk) => {
  let checked = 0;
  for (const [section, slug] of lessons) {
    const body = readDoc(sdk, [section, slug])?.body ?? '';
    for (const [, file, excerpt] of body.matchAll(
      /<hb-code-example header="((?:runtime|server|react|angular)\/[^"]+)">\s*```[^\n]+\n([\s\S]*?)\n```/g,
    )) {
      const source = readFileSync(
        resolve(import.meta.dirname, '../../examples/quickstart', file),
        'utf8',
      );
      const normalize = (value: string) =>
        value
          .split('\n')
          .map((line) => line.trim())
          .join('\n')
          .trim();

      expect(normalize(source), file).toContain(normalize(excerpt));
      checked++;
    }
  }
  expect(checked).toBeGreaterThanOrEqual(3);
});

test.each(SDKS)(
  '%s history recordings include every native media asset',
  (sdk) => {
    for (const [, , lesson] of lessons) {
      for (const suffix of [
        '.mp4',
        '.webm',
        '.vtt',
        '-poster.png',
        '-result.png',
        '-transcript.txt',
      ]) {
        const file = `canonical-workbench-${lesson}-${sdk}${suffix}`;

        expect(
          existsSync(
            resolve(import.meta.dirname, '../../public/video/docs', file),
          ),
          file,
        ).toBe(true);
      }
    }
  },
);
