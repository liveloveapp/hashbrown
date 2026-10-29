import { expect } from 'vitest';
import {
  assertWorkbenchLesson,
  workbenchMediaId,
} from '../../src/components/workbench/workbench-lessons';
import type { Sdk } from '../../src/lib/content';

/** Assert a matching video teaser precedes teaching and its inline lesson follows it. */
export function expectConceptFirstWorkbench(
  body: string,
  sdk: string,
  lesson: string,
): void {
  expect(['angular', 'react']).toContain(sdk);
  const media = workbenchMediaId(assertWorkbenchLesson(lesson), sdk as Sdk);
  const teaser = body.indexOf(`<hb-docs-demo demo="${media}">`);
  const firstSection = body.indexOf('\n## ');
  const boundary = body.indexOf('\n## Explore it in the workbench\n');
  const panel = body.indexOf(`<hb-workbench lesson="${lesson}">`);

  expect(teaser, `${lesson}: matching video teaser`).toBeGreaterThan(-1);
  expect(firstSection, `${lesson}: teaching section`).toBeGreaterThan(teaser);
  expect(boundary, `${lesson}: separate workbench section`).toBeGreaterThan(
    firstSection,
  );
  expect(panel, `${lesson}: matching inline workbench`).toBeGreaterThan(
    boundary,
  );
}
