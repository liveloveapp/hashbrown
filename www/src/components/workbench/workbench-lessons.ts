import type { Sdk } from '@/lib/content';
import type { DocsDemoId } from '../elements/docs-demo-media';
// Pure lesson data with no imports, so it is safe in the client bundle.
import {
  type WorkbenchLessonId,
  workbenchLessons,
} from '../../../examples/quickstart/runtime/workbench-lessons';
import { workbenchMediaName } from './workbench-media';

export type { WorkbenchLessonId };

/** Highlighted lesson source shown in the panel's Source tab. */
export interface WorkbenchSourceData {
  readonly commit: string;
  readonly files: readonly {
    readonly path: string;
    /** Build-time highlighted HTML. */
    readonly html: string;
    readonly highlights: readonly { start: number; end: number }[];
  }[];
}

/** Lessons whose Live mode needs a local server, so docs never embed it. */
export const LOOPBACK_LESSONS: readonly WorkbenchLessonId[] = [
  'server-threads',
  'public-endpoint',
];

/** Lessons with no published capture; their Replay tab shows the video. */
export const WORKBENCH_LESSONS_WITHOUT_CAPTURE: readonly WorkbenchLessonId[] = [
  'production-recovery',
];

/** Lessons whose capture starts after a page reload the video includes. */
export const PARTIAL_CAPTURE_LESSONS: readonly WorkbenchLessonId[] = [
  'server-threads',
  'save-text-conversations',
];

/**
 * The hosted workbench origin the docs embed and link to, normalized so a
 * trailing slash or path in the configured value cannot break origin checks.
 */
export function workbenchOrigin(): string {
  return new URL(
    process.env.NEXT_PUBLIC_WORKBENCH_ORIGIN ??
      'https://workbench.hashbrown.dev',
  ).origin;
}

/**
 * The recorded video for a lesson in one SDK.
 *
 * @param lesson - A workbench lesson id.
 * @param sdk - The docs SDK.
 */
export function workbenchMediaId(
  lesson: WorkbenchLessonId,
  sdk: Sdk,
): DocsDemoId {
  return `canonical-workbench-${workbenchMediaName(lesson)}-${sdk}` as DocsDemoId;
}

/**
 * A lesson's display title.
 *
 * @param lesson - A workbench lesson id.
 */
export function workbenchLessonTitle(lesson: WorkbenchLessonId): string {
  return workbenchLessons.find((item) => item.id === lesson)?.title ?? lesson;
}
