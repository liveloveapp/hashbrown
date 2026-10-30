import { create, push, resolve } from '@cacheplane/json-stream';
import type { WorkbenchFrame } from './workbench';

/** One way of viewing an inspector tab's content in the compact panel. */
export type WorkbenchInspectorMode = {
  readonly id: string;
  readonly label: string;
  readonly value: unknown;
};

type Section = { heading: string; value: unknown };

/**
 * Parses possibly incomplete JSON text into the value that has arrived so far.
 *
 * @param text - JSON text, which may be cut off mid-token.
 * @returns The partial value, or `undefined` for blank text or on error.
 */
export function parsePartialJson(text: string): unknown {
  if (text.trim() === '') return undefined;
  try {
    return resolve(push(create(), text));
  } catch {
    return undefined;
  }
}

const connectors = new Set([
  'and',
  'of',
  'the',
  'for',
  'with',
  'to',
  'by',
  'from',
]);

function shortLabel(heading: string): string {
  const words = heading.split(/\s+/).filter(Boolean).slice(0, 2);
  while (
    words.length > 1 &&
    connectors.has(words[words.length - 1].toLowerCase())
  )
    words.pop();
  return words.join(' ');
}

/**
 * Builds the modes a compact inspector tab can toggle between.
 *
 * The UI and JSON tabs of a generative lesson (format `ui`, without a recipe
 * override) always get Raw, Parsed and Resolved, whether or not the current
 * frame has streamed JSON yet; modes without data hold `undefined`.
 *
 * @param input - The tab, output format, frame and the sections it displays.
 * @returns The ordered modes for the tab.
 */
export function workbenchInspectorModes(input: {
  tab: string;
  format?: string;
  frame: WorkbenchFrame | null;
  application: unknown;
  top: Section;
  bottom: Section;
  raw: unknown;
  /** True when the sections come from a lesson recipe, whose own data must stay visible. */
  recipe?: boolean;
}): readonly WorkbenchInspectorMode[] {
  const { tab, format, frame, application, top, bottom, raw, recipe } = input;
  // Decided by the lesson, not the frame, so the list holds while JSON streams in.
  const generative = format === 'ui' && !recipe;
  const json = frame?.json || undefined;
  const streamed = (): WorkbenchInspectorMode[] => [
    { id: 'raw', label: 'Raw', value: json },
    {
      id: 'parsed',
      label: 'Parsed',
      value: parsePartialJson(json ?? ''),
    },
    { id: 'resolved', label: 'Resolved', value: frame?.props ?? undefined },
  ];

  if (generative && tab === 'ui') {
    return [{ id: 'schema', label: 'Schema', value: top.value }, ...streamed()];
  }
  if (generative && tab === 'json') return streamed();
  if (tab === 'state') {
    const state = {
      ...(application as Record<string, unknown>),
      moment: bottom.value,
    };
    return [
      { id: 'tree', label: 'Tree', value: state },
      { id: 'json', label: 'JSON', value: state },
      { id: 'raw', label: 'Raw', value: raw },
    ];
  }
  return [
    { id: 'top', label: shortLabel(top.heading), value: top.value },
    { id: 'bottom', label: shortLabel(bottom.heading), value: bottom.value },
    { id: 'raw', label: 'Raw', value: raw },
  ];
}

/**
 * Picks the mode a tab shows before the reader chooses one.
 *
 * @param tab - The inspector tab id.
 * @param modes - The modes available for that tab.
 * @returns The default mode id.
 */
export function defaultInspectorMode(
  tab: string,
  modes: readonly WorkbenchInspectorMode[],
): string {
  const preferred = { ui: 'resolved', json: 'parsed', state: 'tree' }[
    tab as 'ui' | 'json' | 'state'
  ];
  if (preferred && modes.some((mode) => mode.id === preferred)) {
    return preferred;
  }
  return modes[0]?.id ?? '';
}

/**
 * Creates a per-tab memory of the chosen mode for the life of the page.
 *
 * @returns Accessors to read and write the chosen mode id by tab.
 */
export function createInspectorModeMemory(): {
  get(tab: string): string | undefined;
  set(tab: string, id: string): void;
} {
  const chosen = new Map<string, string>();
  return {
    get: (tab) => chosen.get(tab),
    set: (tab, id) => {
      chosen.set(tab, id);
    },
  };
}
