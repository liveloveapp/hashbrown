import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

const lessons = [
  ['shared-agent-state', 'shared-state'],
  ['activities', 'activities'],
  ['interrupt-and-resume', 'interrupts'],
] as const;

test.each(SDKS)(
  '%s workflow guides use focused canonical recordings',
  (sdk) => {
    for (const [slug, lesson] of lessons) {
      const body = readDoc(sdk, ['concept', slug])?.body ?? '';
      const id = `canonical-workbench-${lesson}-${sdk}`;

      expect(body.indexOf(`<hb-docs-demo demo="${id}">`)).toBeGreaterThan(-1);
      expect(body.indexOf(`<hb-docs-demo demo="${id}">`)).toBeLessThan(
        body.indexOf('\n## '),
      );
      expect(body).toContain(`/video/docs/${id}-result.png`);
      expect(body).toContain(`/${sdk}.html?lesson=${lesson}`);
      expect(body).toContain('two-step plan');
      expect(body).toContain(`/docs/${sdk}/start/workbench`);
      expect(body).not.toMatch(/Lisbon|itinerary|trip-progress|account-123/);
    }
  },
);

test.each(SDKS)(
  '%s workflow excerpts match their checked example source',
  (sdk) => {
    let count = 0;
    for (const [slug] of lessons) {
      const body = readDoc(sdk, ['concept', slug])?.body ?? '';
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
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(3);
  },
);

test.each(SDKS)(
  '%s state guide distinguishes local edits, drafts and committed state',
  (sdk) => {
    const body = readDoc(sdk, ['concept', 'shared-agent-state'])?.body ?? '';

    expect(body).toContain('setState');
    expect(body).toContain('STATE_SNAPSHOT');
    expect(body).toContain('STATE_DELTA');
    expect(body).toContain('does not start');
    expect(body).toMatch(/roll(?:s|ed)? back|rollback/);
    expect(body).toContain('agent');
  },
);

test.each(SDKS)(
  '%s activity guide identifies display-only producer events',
  (sdk) => {
    const body = readDoc(sdk, ['concept', 'activities'])?.body ?? '';

    expect(body).toContain('ACTIVITY_SNAPSHOT');
    expect(body).toContain('ACTIVITY_DELTA');
    expect(body).toContain('activityType');
    expect(body).toContain('links');
    expect(body).toContain('does not');
  },
);

test.each(SDKS)(
  '%s interruption guide keeps batch ownership and recovery explicit',
  (sdk) => {
    const body = readDoc(sdk, ['concept', 'interrupt-and-resume'])?.body ?? '';

    expect(body).toContain('batchId');
    expect(body).toContain('isResuming');
    expect(body).toContain('RUN_STARTED');
    expect(body).toContain('responseSchema');
    expect(body).toContain('new thread');
    expect(body).toContain('server');
  },
);

test.each(SDKS)(
  '%s workflow videos have accessible native playback and complete local media',
  async (sdk) => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { renderMarkdown } = await import('../../src/lib/markdown');
    const { docsComponents } =
      await import('../../src/components/docs-components');
    const { existsSync } = await import('node:fs');

    for (const [, lesson] of lessons) {
      const id = `canonical-workbench-${lesson}-${sdk}`;
      const result = await renderMarkdown(
        `<hb-docs-demo demo="${id}">\n</hb-docs-demo>`,
        docsComponents(sdk),
      );
      const html = renderToStaticMarkup(result.content);

      expect(html).toContain('width="1600"');
      expect(html).toContain('height="1000"');
      expect(html).toContain('preload="none"');
      expect(html).toContain('kind="captions"');
      expect(html).toContain('local AG-UI agent');
      expect(html).not.toMatch(/autoplay/i);
      for (const suffix of [
        '.mp4',
        '.webm',
        '.vtt',
        '-poster.png',
        '-result.png',
        '-transcript.txt',
      ]) {
        expect(
          existsSync(
            resolve(
              import.meta.dirname,
              '../../public/video/docs',
              id + suffix,
            ),
          ),
          id + suffix,
        ).toBe(true);
      }
    }
  },
);
