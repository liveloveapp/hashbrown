import { type AtcState, normalizeHex } from '../store';

/** How long, after a drag ends follow mode, the pill offers to resume. */
export const RESUME_MS = 5000;

/** A followed plane the user dragged away from, offered back until `until`. */
export interface FollowResume {
  readonly hex: string;
  /** `performance.now()` time after which the offer lapses. */
  readonly until: number;
}

/** What the follow pill shows, or null when it is hidden. */
export type FollowPillView = {
  readonly text: string;
  readonly action: 'stop' | 'resume';
  readonly button: string;
  readonly hex: string;
} | null;

/**
 * The map's follow pill: "Following UAL1802" with Stop while a plane is
 * followed; for a few seconds after a drag ended that, "Stopped following
 * UAL1802" with Resume (while the plane is still live); otherwise hidden.
 */
export function followPillView(
  state: AtcState,
  resume: FollowResume | null,
  now: number,
): FollowPillView {
  const label = (hex: string) => state.aircraft.get(hex)?.label ?? null;
  if (state.followingHex !== null) {
    const hex = normalizeHex(state.followingHex);

    return {
      text: `Following ${label(hex) ?? hex.toUpperCase()}`,
      action: 'stop',
      button: 'Stop',
      hex,
    };
  }
  const resumable = resume === null ? null : label(resume.hex);
  if (resume === null || resumable === null || now >= resume.until) {
    return null;
  }

  return {
    text: `Stopped following ${resumable}`,
    action: 'resume',
    button: 'Resume',
    hex: resume.hex,
  };
}

/** The pill element and how to update it. */
export interface FollowPill {
  readonly element: HTMLElement;
  /** Shows `view`, rebuilding only when it changed, or hides the pill. */
  show(view: FollowPillView): void;
}

/**
 * Creates the follow pill (`data-testid="follow-pill"`), a polite status with
 * one button that calls `onAction` with the view it was shown for. Content
 * is text nodes only.
 */
export function createFollowPill(
  doc: Document,
  onAction: (view: NonNullable<FollowPillView>) => void,
): FollowPill {
  const element = doc.createElement('div');
  element.className = 'atc-follow';
  element.setAttribute('data-testid', 'follow-pill');
  element.setAttribute('role', 'status');
  let current: FollowPillView = null;
  let key = '';
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    if (
      current !== null &&
      event.target instanceof Element &&
      event.target.closest('button')
    ) {
      onAction(current);
    }
  });

  return {
    element,
    show(view) {
      current = view;
      element.classList.toggle('is-open', view !== null);
      const next = view === null ? '' : JSON.stringify(view);
      if (next === key) {
        return;
      }
      key = next;
      if (view === null) {
        element.replaceChildren();
        return;
      }
      const text = doc.createElement('span');
      text.append(doc.createTextNode(view.text));
      const button = doc.createElement('button');
      button.type = 'button';
      button.append(doc.createTextNode(view.button));
      element.replaceChildren(text, button);
    },
  };
}
