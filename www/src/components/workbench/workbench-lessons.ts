import type { Sdk } from '@/lib/content';
import type { DocsDemoId } from '../elements/docs-demo-media';
// Pure lesson data with no imports, so it is safe in the client bundle.
import {
  hostedWorkbenchLessons,
  type WorkbenchLesson,
  type WorkbenchLessonId,
  workbenchLessons,
} from '../../../examples/quickstart/runtime/workbench-lessons';
import { workbenchMediaName } from './workbench-media';

export type { WorkbenchLessonId };

/** A 1-based, inclusive line range in a lesson source file. */
export interface WorkbenchLineRange {
  readonly start: number;
  readonly end: number;
}

/**
 * A page's view of its lesson source, built at build time and small enough to
 * inline: the commit, the lesson's files (paths under
 * `www/examples/quickstart/`) and the lines the page's snippets cover. The
 * highlighted file text is fetched from `/workbench-source/<sdk>/<lesson>`
 * only when the reader opens the Source tab.
 */
export interface WorkbenchSourceData {
  /** The commit GitHub links point at. */
  readonly commit: string;
  readonly files: readonly {
    readonly path: string;
    /** Lines the page's snippets cover, in order; empty for none. */
    readonly highlights: readonly WorkbenchLineRange[];
  }[];
}

/**
 * The JSON `/workbench-source/<sdk>/<lesson>` serves: each lesson file
 * highlighted with the site's Shiki theme, one `<span class="line"
 * data-line="N">` per source line.
 */
export interface WorkbenchSourceHtml {
  readonly files: readonly { readonly path: string; readonly html: string }[];
}

/**
 * A workbench lesson by id.
 *
 * @param id - A lesson id, or any string from a URL or markdown attribute.
 * @returns The lesson, or `undefined` when `id` is not a lesson id.
 */
export function findWorkbenchLesson(id: string): WorkbenchLesson | undefined {
  return workbenchLessons.find((item) => item.id === id);
}

/**
 * The SDK a docs workbench panel runs for a page's SDK. Blog posts, API
 * summaries and any unknown value use React.
 *
 * @param sdk - The SDK whose docs are rendering.
 */
export function docsPanelSdk(sdk: string): Sdk {
  return sdk === 'angular' ? 'angular' : 'react';
}

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
  | { readonly live: true }
  | {
      readonly live: false;
      /** Why the hosted workbench cannot run it. */
      readonly reason: 'loopback' | 'production-reference';
      readonly href: string;
    };

/**
 * Whether the hosted workbench can run a lesson live. Derived from the
 * runtime lesson data's `host`: only hosted lessons that are not
 * `loopback` run live; the rest link to the docs page that runs them locally.
 *
 * @param lesson - A workbench lesson id.
 * @param sdk - The docs SDK the link points into.
 */
export function workbenchLiveAvailability(
  lesson: WorkbenchLessonId,
  sdk: Sdk,
): WorkbenchLiveAvailability {
  const data = findWorkbenchLesson(lesson);
  if (data?.host === 'production-reference') {
    return {
      live: false,
      reason: 'production-reference',
      href: `/docs/${sdk}/platform/b4run`,
    };
  }
  if (!isHostedWorkbenchLesson(lesson) || data?.host === 'loopback') {
    return {
      live: false,
      reason: 'loopback',
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
  const lesson = findWorkbenchLesson(value);
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
  return findWorkbenchLesson(lesson)?.title ?? lesson;
}
