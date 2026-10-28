import type { WorkbenchStore } from './workbench';
import {
  parseWorkbenchCapture,
  WORKBENCH_CAPTURE_VERSION,
  type WorkbenchCapture,
} from './workbench-capture';
import type { WorkbenchLesson, WorkbenchLessonId } from './workbench-lessons';
import {
  findWorkbenchMilestone,
  workbenchMilestones,
} from './workbench-timeline';

/** The current docs ↔ workbench message protocol version. */
export const WORKBENCH_MESSAGE_VERSION = 1;

/** A message a docs page sends to an embedded workbench. */
export type WorkbenchParentMessage =
  | { type: 'hb-workbench:load'; version: 1; capture: WorkbenchCapture }
  | { type: 'hb-workbench:seek'; version: 1; milestone: string }
  | { type: 'hb-workbench:play'; version: 1 };

/** A message an embedded workbench sends to its docs page. */
export type WorkbenchChildMessage =
  | {
      type: 'hb-workbench:ready';
      version: 1;
      mode: 'replay' | 'live';
      lesson: WorkbenchLessonId;
      framework: 'react' | 'angular';
    }
  | {
      type: 'hb-workbench:loaded';
      version: 1;
      milestones: readonly { id: string; label: string }[];
      commit: string | null;
    }
  | {
      type: 'hb-workbench:rejected';
      version: 1;
      reason: 'version' | 'lesson' | 'malformed';
    }
  | {
      type: 'hb-workbench:state';
      version: 1;
      mode: 'replay' | 'live';
      milestone: string | null;
      playing: boolean;
    };

const docsOrigins = new Set([
  'https://hashbrown.dev',
  'https://www.hashbrown.dev',
]);
const previewOrigin = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
const localOrigin = /^http:\/\/localhost:\d+$/;

/**
 * Whether a docs page at this origin may drive the workbench: the docs site,
 * a one-label Vercel preview, or a localhost dev server with a port.
 *
 * @param origin - A `MessageEvent.origin`.
 */
export function isAllowedParentOrigin(origin: string): boolean {
  return (
    docsOrigins.has(origin) ||
    previewOrigin.test(origin) ||
    localOrigin.test(origin)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates untrusted message data from a parent page.
 *
 * @param data - A `MessageEvent.data` value.
 * @returns The typed message, or null for anything else (including a `load`
 * whose capture is invalid).
 */
export function parseWorkbenchParentMessage(
  data: unknown,
): WorkbenchParentMessage | null {
  if (!isRecord(data) || data['version'] !== WORKBENCH_MESSAGE_VERSION) {
    return null;
  }
  switch (data['type']) {
    case 'hb-workbench:load': {
      const capture = parseWorkbenchCapture(data['capture']);
      return capture ? { type: data['type'], version: 1, capture } : null;
    }
    case 'hb-workbench:seek':
      return typeof data['milestone'] === 'string'
        ? { type: data['type'], version: 1, milestone: data['milestone'] }
        : null;
    case 'hb-workbench:play':
      return { type: data['type'], version: 1 };
    default:
      return null;
  }
}

/**
 * Why a `load` was refused; a wrong message or capture version wins, and a
 * capture from another lesson or framework is a lesson mismatch.
 */
function loadRejection(
  data: Record<string, unknown>,
  capture: WorkbenchCapture | null,
  lesson: WorkbenchLessonId,
  framework: 'react' | 'angular',
): 'version' | 'lesson' | 'malformed' | null {
  const raw = data['capture'];
  const captureVersion = isRecord(raw) ? raw['version'] : undefined;
  if (
    data['version'] !== WORKBENCH_MESSAGE_VERSION ||
    (captureVersion !== undefined &&
      captureVersion !== WORKBENCH_CAPTURE_VERSION)
  )
    return 'version';
  if (!capture) return 'malformed';
  return capture.lesson === lesson && capture.framework === framework
    ? null
    : 'lesson';
}

/** What an embedded mount exposes to the message protocol. */
export interface WorkbenchMessageHost {
  readonly mode: 'replay' | 'live';
  readonly lesson: WorkbenchLessonId;
  readonly framework: 'react' | 'angular';
  readonly format?: WorkbenchLesson['format'];
  readonly store: WorkbenchStore;
  readonly isPlaying: () => boolean;
  readonly play: () => void;
  readonly pause: () => void;
  /** Called with the capture's commit once its events have loaded. */
  readonly loaded: (commit: string | null) => void;
}

/** The attached protocol: report playback changes the store cannot see. */
export interface WorkbenchMessages {
  /** Call when playback starts or stops outside a parent message. */
  readonly playbackChanged: () => void;
  readonly dispose: () => void;
}

/**
 * Lets the parent docs page drive an embedded workbench. Posts `ready` to
 * any origin, then accepts messages only from `window.parent` at an allowed
 * origin, and posts every later message to that origin alone.
 *
 * @param host - The embedded mount's store, lesson and playback controls.
 */
export function attachWorkbenchMessages(
  host: WorkbenchMessageHost,
): WorkbenchMessages {
  const parent = window.parent;
  let parentOrigin: string | null = null;
  const post = (message: WorkbenchChildMessage) => {
    if (parentOrigin) parent.postMessage(message, parentOrigin);
  };
  const activeMilestone = () => {
    const snapshot = host.store.getSnapshot();
    const index = snapshot.cursor ?? snapshot.events.length - 1;
    return (
      workbenchMilestones(snapshot.events, host.format)
        .filter((item) => item.index <= index)
        .at(-1)?.id ?? null
    );
  };
  const postState = () =>
    post({
      type: 'hb-workbench:state',
      version: 1,
      mode: host.mode,
      milestone: activeMilestone(),
      playing: host.isPlaying(),
    });
  const replaying = () =>
    host.mode === 'replay' && host.store.getSnapshot().readOnly;
  let cursor = host.store.getSnapshot().cursor;
  // Cursor moves we cause report once, after the action, not per notify.
  let acting = false;
  const act = (action: () => void) => {
    acting = true;
    try {
      action();
    } finally {
      acting = false;
      cursor = host.store.getSnapshot().cursor;
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== parent || !isAllowedParentOrigin(event.origin)) return;
    const data: unknown = event.data;
    if (!isRecord(data) || typeof data['type'] !== 'string') return;
    if (!data['type'].startsWith('hb-workbench:')) return;
    parentOrigin = event.origin;
    const message = parseWorkbenchParentMessage(data);
    if (data['type'] === 'hb-workbench:load') {
      if (host.mode !== 'replay') return;
      const capture =
        message?.type === 'hb-workbench:load' ? message.capture : null;
      const reason = loadRejection(data, capture, host.lesson, host.framework);
      if (reason || !capture) {
        post({
          type: 'hb-workbench:rejected',
          version: 1,
          reason: reason ?? 'malformed',
        });
        return;
      }
      const before = host.store.getSnapshot();
      let failed = false;
      try {
        act(() => {
          host.pause();
          host.store.load(capture.events);
        });
      } catch {
        // Loading renders synchronously; a throw there leaves no commit.
        failed = true;
      }
      const after = host.store.getSnapshot();
      // The store refuses empty traces (and loads during a live run).
      if (
        failed ||
        after === before ||
        !after.readOnly ||
        !after.events.length
      ) {
        post({
          type: 'hb-workbench:rejected',
          version: 1,
          reason: 'malformed',
        });
        return;
      }
      host.loaded(capture.commit);
      post({
        type: 'hb-workbench:loaded',
        version: 1,
        milestones: workbenchMilestones(capture.events, host.format).map(
          ({ id, label }) => ({ id, label }),
        ),
        commit: capture.commit,
      });
      return;
    }
    if (!message || !replaying()) return;
    if (message.type === 'hb-workbench:seek') {
      const milestone = findWorkbenchMilestone(
        host.store.getSnapshot().events,
        message.milestone,
        host.format,
      );
      if (!milestone) return;
      act(() => {
        host.pause();
        host.store.seek(milestone.index);
      });
      postState();
      return;
    }
    if (message.type === 'hb-workbench:play') {
      act(host.play);
      postState();
    }
  };

  // Report cursor moves (playback, scrubbing) once a parent has spoken.
  const unsubscribe = host.store.subscribe(() => {
    const next = host.store.getSnapshot().cursor;
    if (acting || next === cursor) return;
    cursor = next;
    if (replaying()) postState();
  });

  window.addEventListener('message', onMessage);
  parent.postMessage(
    {
      type: 'hb-workbench:ready',
      version: 1,
      mode: host.mode,
      lesson: host.lesson,
      framework: host.framework,
    } satisfies WorkbenchChildMessage,
    '*',
  );
  return {
    playbackChanged: () => {
      if (!acting && replaying()) postState();
    },
    dispose: () => {
      window.removeEventListener('message', onMessage);
      unsubscribe();
      parentOrigin = null;
    },
  };
}
