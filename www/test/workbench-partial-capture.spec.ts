import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  assertWorkbenchCaptureAfterReload,
  workbenchLessons,
} from '../examples/quickstart/runtime/workbench-lessons';
import { PARTIAL_CAPTURE_LESSONS } from '../src/components/workbench/workbench-lessons';

const tools = join(import.meta.dirname, '../src/tools');

// The local-models fixture failure checks reload a page that never runs live,
// so no published recording includes that reload.
const fixtureOnlyReloads = ['verify-local-workbench.ts'];

test('partial-capture lessons are the lessons flagged as captured after a reload', () => {
  const flagged = workbenchLessons
    .filter((lesson) => lesson.capture === 'after-reload')
    .map((lesson) => lesson.id);

  const derived = PARTIAL_CAPTURE_LESSONS;

  expect(derived).toEqual(flagged);
  expect(derived).toEqual([
    'server-threads',
    'save-text-conversations',
    'production-recovery',
  ]);
});

test('the capture-after-reload guard accepts flagged lessons and rejects the rest', () => {
  const flagged = () => assertWorkbenchCaptureAfterReload('server-threads');

  const unflagged = () => assertWorkbenchCaptureAfterReload('public-endpoint');

  expect(flagged).not.toThrow();
  expect(unflagged).toThrow(/public-endpoint/);
});

test('every recording reload is guarded by the lesson capture flag', () => {
  const files = readdirSync(tools).filter(
    (file) => file.endsWith('.ts') && !fixtureOnlyReloads.includes(file),
  );

  const unguarded = files.flatMap((file) => {
    const lines = readFileSync(join(tools, file), 'utf8').split('\n');
    return lines.flatMap((line, index) =>
      line.includes('page.reload(') &&
      !lines
        .slice(Math.max(0, index - 3), index)
        .some((previous) =>
          previous.includes('assertWorkbenchCaptureAfterReload('),
        )
        ? [`${file}:${index + 1}`]
        : [],
    );
  });

  expect(unguarded).toEqual([]);
});
