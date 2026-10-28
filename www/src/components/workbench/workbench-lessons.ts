import type { Sdk } from '@/lib/content';
import type { DocsDemoId } from '../elements/docs-demo-media';
// Pure lesson data with no imports, so it is safe in the client bundle.
import {
  hostedWorkbenchLessons,
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

/**
 * Whether the hosted workbench serves a lesson at all. Loopback lessons are
 * served (only their API is local); production-reference lessons are not.
 *
 * @param lesson - A workbench lesson id.
 */
export function isHostedWorkbenchLesson(lesson: WorkbenchLessonId): boolean {
  return hostedWorkbenchLessons.some((item) => item.id === lesson);
}

/** Whether a lesson's Live tab can run, and where to run it otherwise. */
export type WorkbenchLiveAvailability =
  { readonly live: true } | { readonly live: false; readonly href: string };

/**
 * Whether the hosted workbench can run a lesson live. Derived from the
 * runtime lesson data: only hosted lessons that are not loopback-only run
 * live; the rest link to the docs page that runs them locally.
 *
 * @param lesson - A workbench lesson id.
 * @param sdk - The docs SDK the link points into.
 */
export function workbenchLiveAvailability(
  lesson: WorkbenchLessonId,
  sdk: Sdk,
): WorkbenchLiveAvailability {
  const data = workbenchLessons.find((item) => item.id === lesson);
  if (data?.host === 'production-reference') {
    return { live: false, href: `/docs/${sdk}/platform/b4run` };
  }
  if (!isHostedWorkbenchLesson(lesson) || LOOPBACK_LESSONS.includes(lesson)) {
    return {
      live: false,
      href: `/docs/${sdk}/start/workbench#run-the-example`,
    };
  }
  return { live: true };
}

/**
 * Lessons with no published capture; their Replay tab shows the video.
 * Empty while every lesson publishes one.
 */
export const WORKBENCH_LESSONS_WITHOUT_CAPTURE: readonly WorkbenchLessonId[] =
  [];

/** Lessons whose capture starts after a page reload the video includes. */
export const PARTIAL_CAPTURE_LESSONS: readonly WorkbenchLessonId[] = [
  'server-threads',
  'save-text-conversations',
  'production-recovery',
];

/**
 * The hosted workbench origin the docs embed and link to, normalized so a
 * trailing slash or path in the configured value cannot break origin checks.
 */
export function workbenchOrigin(): string {
  const fallback = 'https://workbench.hashbrown.dev';
  // An empty or malformed value falls back rather than breaking every page.
  try {
    return new URL(process.env.NEXT_PUBLIC_WORKBENCH_ORIGIN || fallback).origin;
  } catch {
    return fallback;
  }
}

/**
 * Narrow a markdown `lesson` attribute to a workbench lesson id, so a typo in
 * a docs page fails the build instead of embedding a broken panel.
 *
 * @param value - The attribute value.
 * @throws When the value is not a workbench lesson id.
 */
export function assertWorkbenchLesson(value: string): WorkbenchLessonId {
  const lesson = workbenchLessons.find((item) => item.id === value);
  if (!lesson) throw new Error(`Unknown workbench lesson: ${value}`);
  return lesson.id;
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
