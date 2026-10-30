import type { WorkbenchStore } from './workbench';
import { getWorkbenchEmbedMode } from './workbench-embed';
import {
  isWorkbenchLoopbackHostname,
  type WorkbenchLesson,
} from './workbench-lessons';
import {
  canMutateWorkbenchHistory,
  canSaveWorkbenchHistory,
  decodeWorkbenchHistory,
  encodeWorkbenchHistory,
  isWorkbenchHistoryBusy,
  normalizeWorkbenchHistoryObservation,
  type WorkbenchHistoryObservationInput,
  type WorkbenchHistorySlot,
  type WorkbenchTextDocument,
} from './workbench-history';

/** Canonical server lesson IDs, each with isolated application records. */
export type WorkbenchServerLesson = 'server-threads' | 'public-endpoint';
/** Safe server snapshot; this is completed text, never an agent checkpoint. */
export interface WorkbenchServerSnapshot {
  readonly id: string;
  readonly version: number;
  readonly messages: WorkbenchTextDocument['messages'];
}
/** Safe HTTP observation; cookies, request headers and credentials are deliberately excluded. */
export interface WorkbenchServerOperation {
  readonly action: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly source: string | null;
}
/** Immutable application capture paired with actual SDK history. */
export interface WorkbenchServerHistoryState {
  readonly selectedSlot: WorkbenchHistorySlot;
  readonly threadId: string | null;
  readonly version: number | null;
  readonly snapshot: WorkbenchServerSnapshot | null;
  readonly access: 'unknown' | 'anonymous' | 'local-demo';
  readonly threads: Record<
    WorkbenchServerLesson,
    Record<WorkbenchHistorySlot, string>
  > | null;
  readonly foreignThreadId: string | null;
  readonly operations: readonly WorkbenchServerOperation[];
  readonly busy: boolean;
  readonly error: string | null;
}
/**
 * Whether a page may call the loopback-only server API: `session` may;
 * `replay` (a docs replay embed) shows only its capture; `hosted` (a loopback
 * lesson off a loopback host) would only get 403s.
 */
export type WorkbenchServerAccess = 'session' | 'replay' | 'hosted';

/**
 * Decides whether a page may call the loopback-only server API, using the
 * same loopback hostnames the server accepts.
 *
 * @param location - The page location, such as `window.location`.
 * @param lesson - The page's lesson.
 */
export function getWorkbenchServerAccess(
  location: Pick<Location, 'hostname' | 'search'>,
  lesson: Pick<WorkbenchLesson, 'host'>,
): WorkbenchServerAccess {
  if (getWorkbenchEmbedMode(location.search) === 'replay') return 'replay';
  return lesson.host === 'loopback' &&
    !isWorkbenchLoopbackHostname(location.hostname)
    ? 'hosted'
    : 'session';
}

/** Framework bindings replace real SDK identity and text together before send is enabled. */
export interface WorkbenchServerHistoryOptions {
  readonly store: WorkbenchStore;
  readonly lesson: WorkbenchServerLesson;
  readonly observation: () => WorkbenchHistoryObservationInput;
  readonly active: () => boolean;
  readonly replace: (
    threadId: string,
    messages: WorkbenchTextDocument['messages'],
  ) => void | Promise<void>;
  readonly fetch?: typeof fetch;
  /** Only `session` (the default) sends server requests. */
  readonly access?: WorkbenchServerAccess;
}

/** Owns explicit server operations, cancellation, optimistic versions and inert replay guards. */
export function createWorkbenchServerHistory(
  options: WorkbenchServerHistoryOptions,
) {
  let state: WorkbenchServerHistoryState = {
    selectedSlot: 'Lighthouse',
    threadId: null,
    version: null,
    snapshot: null,
    access: 'unknown',
    threads: null,
    foreignThreadId: null,
    operations: [],
    busy: false,
    error: null,
  };
  let disposed = false;
  let generation = 0;
  let pending: AbortController | null = null;
  const listeners = new Set<() => void>();
  const root = '/api/workbench/server';
  const access = options.access ?? 'session';
  const mutable = () => {
    const sdk = normalizeWorkbenchHistoryObservation(options.observation());
    return (
      access === 'session' &&
      !disposed &&
      options.active() &&
      !state.busy &&
      canMutateWorkbenchHistory(options.store.getSnapshot()) &&
      !isWorkbenchHistoryBusy(sdk) &&
      !sdk.error &&
      !sdk.pendingInterrupts &&
      !sdk.recoveryRequired
    );
  };
  const publish = (
    patch: Partial<WorkbenchServerHistoryState>,
    action: string,
  ) => {
    state = structuredClone({ ...state, ...patch });
    options.store.recordServerHistory(state, action);
    listeners.forEach((listener) => listener());
  };
  const captureResponse = (
    response: Response,
    action: string,
    method = 'POST',
    path = `${root}/${options.lesson}/chat`,
  ) => {
    if (
      disposed ||
      !options.active() ||
      options.store.getSnapshot().cursor !== null
    )
      return;
    publish(
      {
        operations: [
          ...state.operations,
          {
            action,
            method,
            path,
            status: response.status,
            source: response.headers.get('X-Workbench-Source'),
          },
        ].slice(-40),
      },
      action,
    );
  };
  const request = async (
    action: string,
    path: string,
    method: string,
    body?: unknown,
    credentials: RequestCredentials = 'same-origin',
  ) => {
    if (!mutable()) return null;
    const ticket = ++generation;
    pending = new AbortController();
    publish({ busy: true, error: null }, `${action}-start`);
    try {
      const response = await (options.fetch ?? fetch)(path, {
        method,
        credentials,
        signal: pending.signal,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value: unknown = await response.json();
      if (
        ticket !== generation ||
        disposed ||
        !options.active() ||
        options.store.getSnapshot().cursor !== null
      )
        return null;
      captureResponse(response, action, method, path);
      if (!response.ok)
        throw new Error(
          typeof value === 'object' && value !== null && 'error' in value
            ? String(value.error)
            : `HTTP ${response.status}`,
        );
      return { value, ticket };
    } catch (error) {
      if (ticket === generation && !disposed && options.active())
        publish(
          { error: error instanceof Error ? error.message : String(error) },
          `${action}-failed`,
        );
      return null;
    } finally {
      if (ticket === generation && !disposed) {
        pending = null;
        publish({ busy: false }, `${action}-end`);
      }
    }
  };
  const current = (ticket: number) =>
    ticket === generation &&
    !disposed &&
    options.active() &&
    options.store.getSnapshot().cursor === null;
  const session = async (method: 'GET' | 'POST' | 'DELETE') => {
    const result = await request('session', `${root}/session`, method);
    if (!result || !current(result.ticket)) return;
    const value = result.value as Pick<
      WorkbenchServerHistoryState,
      'access' | 'threads' | 'foreignThreadId'
    >;
    if (value)
      publish(
        { ...value, threadId: null, version: null, snapshot: null },
        'session',
      );
  };
  const threadPath = (id: string) =>
    `${root}/${options.lesson}/threads/${encodeURIComponent(id)}`;
  return {
    access,
    state: () => structuredClone(state),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mutable,
    sendable: () => {
      const snapshot = options.store.getSnapshot();
      const sdk = normalizeWorkbenchHistoryObservation(options.observation());
      return (
        !disposed &&
        options.active() &&
        !state.busy &&
        snapshot.cursor === null &&
        snapshot.status !== 'loading' &&
        snapshot.status !== 'paused' &&
        !snapshot.frame?.history?.replacement &&
        !isWorkbenchHistoryBusy(sdk) &&
        !sdk.pendingInterrupts &&
        !sdk.recoveryRequired &&
        state.access === 'local-demo' &&
        !!state.threadId &&
        state.threadId ===
          state.threads?.[options.lesson][state.selectedSlot] &&
        state.version !== null
      );
    },
    initialize: () => session('GET'),
    startSession: () => session('POST'),
    endSession: () => session('DELETE'),
    select(slot: WorkbenchHistorySlot) {
      if (mutable() && ['Lighthouse', 'Harbor'].includes(slot))
        publish({ selectedSlot: slot }, 'select-server-thread');
    },
    async load() {
      const id = state.threads?.[options.lesson][state.selectedSlot];
      if (!id) return;
      const result = await request('load-server', threadPath(id), 'GET');
      if (!result || !current(result.ticket)) return;
      const value = result.value as WorkbenchServerSnapshot | null;
      const document =
        value &&
        decodeWorkbenchHistory(
          JSON.stringify({ version: 1, messages: value.messages }),
        );
      if (
        !value ||
        !document ||
        Object.keys(value).some(
          (key) => !['id', 'version', 'messages'].includes(key),
        ) ||
        value.id !== id ||
        !Number.isSafeInteger(value.version) ||
        value.version < 0 ||
        !mutable()
      ) {
        if (value && mutable())
          publish(
            { error: 'Invalid server text snapshot' },
            'load-server-failed',
          );
        return;
      }
      const ticket = ++generation;
      const app = options.store.getSnapshot().frame?.history?.app;
      if (
        app &&
        (document.messages.length || options.observation().messages.length)
      )
        options.store.recordHistoryApp(app, 'load');
      publish({ busy: true }, 'replace-server-start');
      try {
        if (!current(ticket)) return;
        await options.replace(id, document.messages);
        if (ticket === generation && !disposed && options.active())
          publish(
            {
              threadId: id,
              version: value.version,
              snapshot: value,
              error: null,
            },
            'loaded-server',
          );
      } catch (error) {
        if (ticket === generation && !disposed && options.active()) {
          options.store.failHistoryReplacement(error);
          publish({ error: String(error) }, 'load-server-failed');
        }
      } finally {
        if (!disposed && ticket === generation)
          publish({ busy: false }, 'replace-server-end');
      }
    },
    async save() {
      if (
        !mutable() ||
        !canSaveWorkbenchHistory(options.store.getSnapshot()) ||
        options.observation().finishReason !== 'stop' ||
        !state.threadId ||
        state.threadId !==
          state.threads?.[options.lesson][state.selectedSlot] ||
        state.version === null
      )
        return;
      const encoded = encodeWorkbenchHistory(options.observation().messages);
      if (!encoded) return;
      const id = state.threadId;
      const expectedVersion = state.version;
      const result = await request(
        'save-server',
        threadPath(state.threadId),
        'PUT',
        {
          expectedVersion: state.version,
          messages: JSON.parse(encoded).messages,
        },
      );
      if (!result || !current(result.ticket)) return;
      const value = result.value as WorkbenchServerSnapshot | null;
      if (
        value &&
        value.id === id &&
        value.version === expectedVersion + 1 &&
        Object.keys(value).every((key) =>
          ['id', 'version', 'messages'].includes(key),
        ) &&
        decodeWorkbenchHistory(
          JSON.stringify({ version: 1, messages: value.messages }),
        )
      )
        publish(
          { version: value.version, snapshot: value, error: null },
          'saved-server',
        );
      else if (value)
        publish(
          { error: 'Invalid server save response' },
          'save-server-failed',
        );
    },
    async competingSave() {
      if (!state.threadId || state.version === null || !state.snapshot) return;
      // An independent ordinary HTTP client writes the last server snapshot; local version stays stale.
      await request(
        'competing-client-save',
        threadPath(state.threadId),
        'PUT',
        { expectedVersion: state.version, messages: state.snapshot.messages },
      );
    },
    checkUnauthenticated: () =>
      request(
        'unauthenticated-denial',
        `${root}/${options.lesson}/chat`,
        'POST',
        {},
        'omit',
      ),
    checkForeign: () =>
      state.foreignThreadId
        ? request(
            'foreign-owner-denial',
            threadPath(state.foreignThreadId),
            'GET',
          )
        : Promise.resolve(null),
    captureResponse,
    /** Aborts deactivated conversation work and rejects late responses while retaining loaded identity and unsaved SDK text. */
    cancelPending() {
      if (disposed) return;
      generation++;
      pending?.abort();
      pending = null;
      if (state.busy) {
        options.store.failHistoryReplacement();
        publish({ busy: false }, 'server-cancelled');
      }
    },
    dispose() {
      disposed = true;
      generation++;
      pending?.abort();
      listeners.clear();
    },
  };
}
