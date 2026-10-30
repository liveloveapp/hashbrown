import type { WorkbenchEvent, WorkbenchSnapshot } from './workbench';
import { workbenchEventKinds } from './workbench-event-kinds';
import { type WorkbenchLessonId, workbenchLessons } from './workbench-lessons';
import { workbenchMilestones } from './workbench-timeline';

/** The current capture schema version. */
export const WORKBENCH_CAPTURE_VERSION = 1;

/** A milestone as recorded in a published capture: its id, event index and label. */
export interface WorkbenchCaptureMilestone {
  readonly id: string;
  /** The index of the milestone's event in the capture's `events`. */
  readonly index: number;
  readonly label: string;
}

/** A serializable recording of one workbench run, replayable in docs. */
export interface WorkbenchCapture {
  readonly version: 1;
  readonly lesson: WorkbenchLessonId;
  readonly framework: 'react' | 'angular';
  /** The commit the capture was recorded at; the publisher fills it. */
  readonly commit: string | null;
  readonly recordedAt: string;
  readonly events: readonly WorkbenchEvent[];
  /**
   * The milestones docs moments seek to, recorded by the publisher. Absent on
   * older captures, which compute them from `events`.
   */
  readonly milestones?: readonly WorkbenchCaptureMilestone[];
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

/**
 * Records a capture's milestones, computed from its events with its lesson's
 * format, replacing any it had. Events are kept as they are.
 *
 * @param capture - A valid capture, stamped or not.
 * @returns A new capture whose `milestones` docs moments resolve against.
 */
export function withWorkbenchCaptureMilestones(
  capture: WorkbenchCapture,
): WorkbenchCapture {
  const format = workbenchLessons.find(
    (lesson) => lesson.id === capture.lesson,
  )?.format;
  return {
    ...capture,
    milestones: workbenchMilestones(capture.events, format).map(
      ({ id, index, label }) => ({ id, index, label }),
    ),
  };
}

/**
 * Whether untrusted data is a plain object (not null or an array), so its
 * fields can be read before they are checked.
 *
 * @param value - Any parsed JSON or message data.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
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
      isFiniteNumber(event['sequence']) &&
      isFiniteNumber(event['turn']) &&
      isFiniteNumber(event['elapsedMs']) &&
      (workbenchEventKinds as readonly unknown[]).includes(event['kind']) &&
      typeof event['source'] === 'string' &&
      Array.isArray(event['messages']) &&
      isRecord(event['application']),
  );
  if (!wellFormed) return null;
  const milestones = value['milestones'];
  if (milestones !== undefined && !isMilestoneList(milestones, events.length))
    return null;
  return {
    version: WORKBENCH_CAPTURE_VERSION,
    lesson: value['lesson'] as WorkbenchLessonId,
    framework: value['framework'],
    commit,
    recordedAt,
    events: events as WorkbenchEvent[],
    ...(milestones === undefined
      ? {}
      : {
          milestones: (milestones as WorkbenchCaptureMilestone[]).map(
            ({ id, index, label }) => ({ id, index, label }),
          ),
        }),
  };
}

/** Whether recorded milestones have unique ids and point at existing events. */
function isMilestoneList(value: unknown, events: number): boolean {
  if (!Array.isArray(value)) return false;
  const ids = new Set<unknown>();
  return value.every((item) => {
    if (!isRecord(item)) return false;
    const { id, index, label } = item;
    if (typeof id !== 'string' || id === '' || ids.has(id)) return false;
    ids.add(id);
    return (
      typeof label === 'string' &&
      Number.isInteger(index) &&
      (index as number) >= 0 &&
      (index as number) < events
    );
  });
}
