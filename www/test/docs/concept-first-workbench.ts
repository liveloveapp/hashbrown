import { expect } from 'vitest';
import {
  assertWorkbenchLesson,
  workbenchMediaId,
} from '../../src/components/workbench/workbench-lessons';
import type { Sdk } from '../../src/lib/content';

/**
 * Assert a panel page opens with teaching material, not a video, and shows its
 * lesson once: in the inline panel of a separate explore section, with no
 * static result still duplicating the panel's Replay.
 */
export function expectConceptFirstWorkbench(
  body: string,
  sdk: string,
  lesson: string,
): void {
  expect(['angular', 'react']).toContain(sdk);
  const media = workbenchMediaId(assertWorkbenchLesson(lesson), sdk as Sdk);
  const afterTitle = body.split(/^# .+$/m)[1]?.trimStart() ?? '';
  const firstSection = body.indexOf('\n## ');
  const boundary = body.indexOf('\n## Explore it in the workbench\n');
  const panel = body.indexOf(`<hb-workbench lesson="${lesson}">`);

  expect(afterTitle, `${lesson}: no top video`).not.toMatch(
    /^<(?:hb-docs-demo|www-atc-demo-video)\b/,
  );
  expect(body, `${lesson}: no duplicate video`).not.toContain(
    `<hb-docs-demo demo="${media}">`,
  );
  expect(body, `${lesson}: no result still`).not.toContain(
    `/video/docs/${media}-result.png`,
  );
  expect(firstSection, `${lesson}: teaching section`).toBeGreaterThan(-1);
  expect(boundary, `${lesson}: separate workbench section`).toBeGreaterThan(
    firstSection,
  );
  expect(panel, `${lesson}: matching inline workbench`).toBeGreaterThan(
    boundary,
  );
}
