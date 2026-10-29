import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { DOCS_DEMOS } from '../../src/components/elements/docs-demo-media';
import {
  assertWorkbenchLesson,
  workbenchMediaId,
} from '../../src/components/workbench/workbench-lessons';
import { listDocs, readDoc, SDKS } from '../../src/lib/content';

// Direct canonical videos plus the videos behind each inline workbench, which
// narrow screens and failed replays show.
const active = [
  ...new Set(
    SDKS.flatMap((sdk) =>
      listDocs(sdk).flatMap((slug) => {
        const body = readDoc(sdk, slug)?.body ?? '';
        return [
          ...[
            ...body.matchAll(
              /<hb-docs-demo demo="(canonical-workbench[^"]+)"/g,
            ),
          ].map((match) => match[1]),
          ...[...body.matchAll(/<hb-workbench lesson="([^"]+)"/g)].map(
            (match) => workbenchMediaId(assertWorkbenchLesson(match[1]), sdk),
          ),
        ];
      }),
    ),
  ),
];
const mediaRoot = resolve(import.meta.dirname, '../../public/video/docs');
const seconds = (stamp: string) => {
  const [hours, minutes, seconds] = stamp.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

test('canonical media audit discovers the complete current rollout', () => {
  expect(active.length).toBeGreaterThanOrEqual(60);
});

test.each(active)(
  '%s has complete accessible media and readable measured captions',
  (id) => {
    const captions = readFileSync(resolve(mediaRoot, `${id}.vtt`), 'utf8');
    const cues = [
      ...captions.matchAll(
        /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\n([^\n]+)/g,
      ),
    ];

    expect(Object.hasOwn(DOCS_DEMOS, id)).toBe(true);
    for (const suffix of [
      '.mp4',
      '.webm',
      '.vtt',
      '-poster.png',
      '-result.png',
      '-transcript.txt',
    ]) {
      expect(existsSync(resolve(mediaRoot, id + suffix)), id + suffix).toBe(
        true,
      );
    }
    expect(captions.startsWith('WEBVTT')).toBe(true);
    expect(cues.length).toBeGreaterThan(0);
    let previous = 0;
    for (const [, from, to, text] of cues) {
      const start = seconds(from),
        end = seconds(to);

      expect(start).toBeGreaterThanOrEqual(previous);
      expect(end).toBeGreaterThan(start);
      expect(
        text.length / (end - start),
        `${from}: ${text}`,
      ).toBeLessThanOrEqual(20);
      previous = end;
    }
  },
);
