import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import {
  publishWorkbenchMedia,
  workbenchMediaSuffixes,
} from '../src/tools/workbench-media-publication';

test('does not replace existing media when a staged batch is incomplete', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'workbench-media-'));
  const staging = resolve(root, 'staged'),
    target = resolve(root, 'public');
  mkdirSync(staging);
  mkdirSync(target);
  const ids = [
    'canonical-workbench-ui-react',
    'canonical-workbench-ui-angular',
  ];
  try {
    for (const id of ids)
      for (const suffix of [
        '.mp4',
        '.webm',
        '.vtt',
        '-poster.png',
        '-result.png',
        '-transcript.txt',
      ]) {
        writeFileSync(resolve(target, id + suffix), 'existing');
        if (id !== ids[1] || suffix !== '-transcript.txt')
          writeFileSync(resolve(staging, id + suffix), 'new');
      }

    expect(() => publishWorkbenchMedia(staging, target, ids)).toThrow(
      /Missing staged/,
    );

    for (const id of ids)
      for (const suffix of [
        '.mp4',
        '.webm',
        '.vtt',
        '-poster.png',
        '-result.png',
        '-transcript.txt',
      ])
        expect(readFileSync(resolve(target, id + suffix), 'utf8')).toBe(
          'existing',
        );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publishes complete staged batches only after preflight', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'workbench-media-'));
  const staging = resolve(root, 'staged'),
    target = resolve(root, 'public');
  mkdirSync(staging);
  mkdirSync(target);
  const id = 'canonical-workbench-ui-react';
  try {
    for (const suffix of workbenchMediaSuffixes)
      writeFileSync(resolve(staging, id + suffix), suffix);

    publishWorkbenchMedia(staging, target, [id]);

    for (const suffix of workbenchMediaSuffixes)
      expect(readFileSync(resolve(target, id + suffix), 'utf8')).toBe(suffix);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
