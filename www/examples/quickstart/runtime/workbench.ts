import { s } from '@hashbrownai/core';

/** A validated, application-owned plan, independent of rendered proposals. */
export interface WorkbenchPlan {
  readonly title: string;
  readonly steps: readonly string[];
}
/** The committed application snapshot. */
export interface WorkbenchApplication {
  readonly revision: number;
  readonly plan: WorkbenchPlan | null;
}
/** Runtime state for one captured user turn. */
export type WorkbenchStatus =
  'idle' | 'loading' | 'complete' | 'error' | 'cancelled';
/** The origin of an observable change in the canonical example. */
export type WorkbenchEventKind =
  | 'request'
  | 'event'
  | 'tool'
  | 'parsed'
  | 'accept'
  | 'error'
  | 'cancel'
  | 'complete'
  | 'user'
  | 'source';
/** A frame captures everything needed for read-only historical playback. */
export interface WorkbenchFrame {
  readonly sequence: number;
  readonly turn: number;
  readonly kind: WorkbenchEventKind;
  readonly payload: unknown;
  readonly source: string;
  readonly elapsedMs: number;
  readonly application: WorkbenchApplication;
  readonly messages: readonly {
    readonly id: string;
    readonly role: 'user' | 'assistant';
    readonly content: string;
    readonly props?: WorkbenchFrame['props'];
  }[];
  readonly json: string;
  readonly props: {
    readonly title?: string;
    readonly steps?: readonly string[];
  } | null;
  readonly status: WorkbenchStatus;
}
/** Each event also contains its immutable presentation frame. */
export type WorkbenchEvent = WorkbenchFrame;
/** A live trace or its selected historical frame. */
export interface WorkbenchSnapshot {
  readonly events: readonly WorkbenchEvent[];
  readonly cursor: number | null;
  readonly turn: number;
  readonly status: WorkbenchStatus;
  readonly application: WorkbenchApplication;
  readonly frame: WorkbenchFrame | null;
}
/** The shared recording boundary used by the two real SDK clients. */
export interface WorkbenchStore {
  getSnapshot(): WorkbenchSnapshot;
  subscribe(listener: () => void): () => void;
  send(content: string): { id: string; role: 'user'; content: string };
  record(kind: WorkbenchEventKind, payload: unknown, requestId?: string): void;
  parsed(ui: unknown): void;
  settle(
    status: 'complete' | 'error' | 'cancelled',
    finishReason?: string,
  ): void;
  accept(proposal: WorkbenchPlan): boolean;
  seek(index: number): void;
  live(): void;
  clear(): void;
}

/** SDK instructions are fixed by the server as well as shown in the checked clients. */
export const workbenchSystem =
  'You help a developer create a small two-step plan. Before every answer call readContext exactly once to read the current application revision and accepted plan. Render exactly one SummaryCard with a short title and exactly two concise steps. The first request should create a plan with outline and record steps. A follow-up requesting a shorter second step should revise that step while retaining the first step verbatim. Rendering does not apply a plan; only the user accepts it. Do not claim application state changed.';

/** Plain typed plan shared by the real structured clients and server. */
export const workbenchPlanSchema = s.object('A two-step plan proposal', {
  title: s.string('A concise plan title'),
  steps: s.streaming.array(
    'Exactly two concise steps',
    s.string('A clear action'),
  ),
});
/** Fixed instructions for plain structured output and explicit application review. */
export const workbenchStructuredSystem =
  'You help a developer create a small two-step plan. Before every answer call readContext exactly once to read the current application revision and accepted plan. Return a plain typed plan with a short title and exactly two concise steps. The first request should create a plan with outline and record steps. A follow-up requesting a shorter second step should revise that step while retaining the first step verbatim. Returning data does not apply a plan; only the user accepts it. Do not claim application state changed.';
/** Extracts only plain structured plan fields, never a generated component tree. */
export function workbenchStructuredProps(
  value: unknown,
): WorkbenchFrame['props'] {
  const props = object(value);
  if (
    !props ||
    Object.keys(props).some((key) => key !== 'title' && key !== 'steps')
  )
    return null;
  const result = {
    ...(typeof props['title'] === 'string' ? { title: props['title'] } : {}),
    ...(Array.isArray(props['steps']) &&
    props['steps'].every((step) => typeof step === 'string')
      ? { steps: [...props['steps']] as string[] }
      : {}),
  };
  return Object.keys(result).length > 0 ? result : null;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function copy<T>(value: T): T {
  return structuredClone(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** Extracts resolved props from Hashbrown's native trusted component tree. */
export function workbenchProps(value: unknown): WorkbenchFrame['props'] {
  const ui = object(value)?.['ui'];
  if (!Array.isArray(ui) || ui.length !== 1) return null;
  const node = object(ui[0]);
  if (!node || Object.keys(node).length !== 1) return null;
  const field = object(object(node['SummaryCard'])?.['props']);
  if (!field) return null;
  const props =
    object(field['value']) ?? object(field['partialValue']) ?? field;
  return {
    ...(typeof props['title'] === 'string' ? { title: props['title'] } : {}),
    ...(Array.isArray(props['steps']) &&
    props['steps'].every((s) => typeof s === 'string')
      ? { steps: [...props['steps']] as string[] }
      : {}),
  };
}
/** Checks the same bounded two-step contract at rendering and application action boundaries. */
export function isWorkbenchPlan(input: unknown): input is WorkbenchPlan {
  const value = object(input);
  return (
    !!value &&
    typeof value['title'] === 'string' &&
    value['title'].trim().length > 0 &&
    value['title'].length <= 120 &&
    Array.isArray(value['steps']) &&
    value['steps'].length === 2 &&
    value['steps'].every(
      (step) =>
        typeof step === 'string' &&
        step.trim().length > 0 &&
        step.length <= 200,
    )
  );
}

/** Creates an isolated capture. Seeking changes only the selected frame, never live state. */
export function createWorkbenchStore(
  format: 'ui' | 'structured' = 'ui',
): WorkbenchStore {
  let application: WorkbenchApplication = freeze({ revision: 0, plan: null });
  let events: readonly WorkbenchEvent[] = [];
  let cursor: number | null = null;
  let turn = 0;
  let status: WorkbenchStatus = 'idle';
  let messages: WorkbenchFrame['messages'] = [];
  let json = '';
  let props: WorkbenchFrame['props'] = null;
  let propsReady = false;
  let finishReason: string | undefined;
  let started = 0;
  let appliedTurn = -1;
  let generation = 0;
  let snapshot: WorkbenchSnapshot;
  const listeners = new Set<() => void>();
  const notify = () => {
    snapshot = freeze({
      events,
      cursor,
      turn,
      status,
      application,
      frame:
        cursor === null ? (events.at(-1) ?? null) : (events[cursor] ?? null),
    });
    listeners.forEach((listener) => listener());
  };
  const record = (kind: WorkbenchEventKind, payload: unknown) => {
    if (
      turn === 0 ||
      (status !== 'loading' &&
        ['event', 'request', 'tool', 'parsed'].includes(kind))
    )
      return;
    if (events.length >= 2000) {
      status = 'error';
      finishReason = undefined;
      notify();
      return;
    }
    const raw = object(payload);
    if (kind === 'request') json = '';
    if (kind === 'event' && raw?.['type'] === 'TEXT_MESSAGE_START') json = '';
    if (
      kind === 'event' &&
      raw?.['type'] === 'TEXT_MESSAGE_CONTENT' &&
      typeof raw['delta'] === 'string'
    ) {
      json += raw['delta'];
      const id =
        typeof raw['messageId'] === 'string'
          ? raw['messageId']
          : `assistant-${turn}`;
      const previous = messages.find((message) => message.id === id);
      messages = [
        ...messages.filter((m) => m.id !== id),
        { ...previous, id, role: 'assistant', content: json },
      ];
    }
    const frame: WorkbenchFrame = freeze(
      copy({
        sequence: events.length + 1,
        turn,
        kind,
        payload,
        source:
          kind === 'parsed'
            ? 'SDK parsed output'
            : kind === 'event' || kind === 'request'
              ? 'Browser transport'
              : 'Application',
        elapsedMs: Math.round(Math.max(0, performance.now() - started)),
        application,
        messages,
        json,
        props,
        status,
      }),
    );
    events = [...events, frame];
    notify();
  };
  notify();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send(content) {
      const text = content.trim();
      if (
        cursor !== null ||
        status === 'loading' ||
        !text ||
        text.length > 2000
      )
        throw new Error(
          'Return to live mode and finish the current turn before sending.',
        );
      if (turn === 0) started = performance.now();
      turn++;
      status = 'loading';
      props = null;
      propsReady = false;
      json = '';
      finishReason = undefined;
      const message = {
        id: `workbench-${generation}-${turn}`,
        role: 'user' as const,
        content: text,
      };
      messages = [...messages, message];
      record('user', message);
      return message;
    },
    record,
    parsed(value) {
      if (status !== 'loading') return;
      const next =
        format === 'structured'
          ? workbenchStructuredProps(value)
          : workbenchProps(value);
      const ui = object(value)?.['ui'];
      const field = Array.isArray(ui)
        ? object(object(object(ui[0])?.['SummaryCard'])?.['props'])
        : undefined;
      const ready =
        format === 'structured'
          ? isWorkbenchPlan(next)
          : !!field && (!('complete' in field) || field['complete'] === true);
      if (
        JSON.stringify(next) === JSON.stringify(props) &&
        propsReady === ready
      )
        return;
      props = next;
      propsReady = ready;
      const assistant = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant');
      if (assistant && messages.at(-1)?.role === 'assistant')
        messages = messages.map((message) =>
          message.id === assistant.id ? { ...message, props: next } : message,
        );
      else
        messages = [
          ...messages,
          {
            id: `parsed-${generation}-${turn}`,
            role: 'assistant',
            content: json,
            props: next,
          },
        ];
      record('parsed', value);
    },
    settle(next, reason) {
      if (status !== 'loading') return;
      status = next;
      finishReason = reason;
      record(
        next === 'complete'
          ? 'complete'
          : next === 'error'
            ? 'error'
            : 'cancel',
        { status: next, finishReason: reason },
      );
    },
    accept(proposal) {
      if (
        cursor !== null ||
        status !== 'complete' ||
        finishReason !== 'stop' ||
        appliedTurn === turn ||
        !propsReady ||
        !isWorkbenchPlan(props) ||
        !isWorkbenchPlan(proposal) ||
        props.title !== proposal.title ||
        props.steps.length !== proposal.steps.length ||
        props.steps.some((step, index) => step !== proposal.steps[index])
      )
        return false;
      application = freeze(
        copy({
          revision: application.revision + 1,
          plan: { title: proposal.title, steps: [...proposal.steps] },
        }),
      );
      appliedTurn = turn;
      record('accept', application);
      return true;
    },
    seek(index) {
      if (
        status === 'loading' ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= events.length
      )
        return;
      cursor = index;
      notify();
    },
    live() {
      cursor = null;
      notify();
    },
    clear() {
      generation++;
      application = freeze({ revision: 0, plan: null });
      events = [];
      cursor = null;
      turn = 0;
      status = 'idle';
      messages = [];
      json = '';
      props = null;
      propsReady = false;
      finishReason = undefined;
      appliedTurn = -1;
      notify();
    },
  };
}
