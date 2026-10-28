import type { WorkbenchEvent, WorkbenchSnapshot } from './workbench';
import { type WorkbenchLessonId, workbenchLessons } from './workbench-lessons';

/** The current capture schema version. */
export const WORKBENCH_CAPTURE_VERSION = 1;

/** A serializable recording of one workbench run, replayable in docs. */
export interface WorkbenchCapture {
  readonly version: 1;
  readonly lesson: WorkbenchLessonId;
  readonly framework: 'react' | 'angular';
  /** The commit the capture was recorded at; the publisher fills it. */
  readonly commit: string | null;
  readonly recordedAt: string;
  readonly events: readonly WorkbenchEvent[];
}

/**
 * Creates a capture from a store snapshot. `commit` is null until published.
 */
export function createWorkbenchCapture(
  snapshot: WorkbenchSnapshot,
  meta: {
    lesson: WorkbenchLessonId;
    framework: 'react' | 'angular';
    recordedAt: string;
  },
): WorkbenchCapture {
  return {
    version: WORKBENCH_CAPTURE_VERSION,
    lesson: meta.lesson,
    framework: meta.framework,
    commit: null,
    recordedAt: meta.recordedAt,
    events: snapshot.events,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates untrusted JSON as a capture. Returns null on a wrong version, an
 * unknown lesson, a bad framework or malformed events.
 */
export function parseWorkbenchCapture(value: unknown): WorkbenchCapture | null {
  if (!isRecord(value)) return null;
  if (value['version'] !== WORKBENCH_CAPTURE_VERSION) return null;
  if (!workbenchLessons.some((lesson) => lesson.id === value['lesson'])) {
    return null;
  }
  if (value['framework'] !== 'react' && value['framework'] !== 'angular') {
    return null;
  }
  const { commit, recordedAt, events } = value;
  if (commit !== null && typeof commit !== 'string') return null;
  if (typeof recordedAt !== 'string') return null;
  if (!Array.isArray(events)) return null;
  const wellFormed = events.every(
    (event) =>
      isRecord(event) &&
      typeof event['sequence'] === 'number' &&
      typeof event['turn'] === 'number' &&
      typeof event['elapsedMs'] === 'number',
  );
  if (!wellFormed) return null;
  return {
    version: WORKBENCH_CAPTURE_VERSION,
    lesson: value['lesson'] as WorkbenchLessonId,
    framework: value['framework'],
    commit,
    recordedAt,
    events: events as WorkbenchEvent[],
  };
}
