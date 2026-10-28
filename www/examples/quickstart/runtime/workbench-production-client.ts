import type {
  ConversationSnapshot,
  PendingInterruptBatch,
  ResumeOptions,
} from '@hashbrownai/core';
import type { WorkbenchStore } from './workbench';
import {
  type ProductionRecovery,
  type ProductionState,
  readProductionRecovery,
} from './workbench-production';

/** Application observations recorded separately from native SDK lifecycle and events. */
export interface ProductionClientState {
  readonly threadId: string;
  /** The selected thread attached by a successful explicit SDK restoration. */
  readonly attachedThreadId?: string;
  readonly disposition: ProductionRecovery['disposition'] | 'unread';
  readonly application: ProductionState | null;
  readonly busy: boolean;
  readonly operation: string;
  readonly error: string;
}
/** Minimal live SDK boundary; each invocation reads the current framework values. */
export interface ProductionSdk {
  readonly revision: number;
  readonly busy: boolean;
  readonly error?: unknown;
  readonly recoveryRequired?: boolean;
  readonly finishReason?: string;
  readonly pending?: PendingInterruptBatch;
  restore(
    snapshot: ConversationSnapshot<ProductionState>,
    options: { expectedRevision: number },
  ): void;
  resume(options: ResumeOptions): void;
}
/** Creates an explicit, revision-guarded owner-scoped recovery controller. */
export function createProductionClient(
  store: WorkbenchStore,
  sdk: () => ProductionSdk,
  active: () => boolean,
  request: typeof fetch = (...args) => fetch(...args),
  storage?: () => Storage,
) {
  let disposed = false;
  let observedWork = false;
  let nonce = 0;
  let state: ProductionClientState = {
    threadId: '',
    attachedThreadId: '',
    disposition: 'unread',
    application: null,
    busy: false,
    operation: 'Create a thread or enter a remembered thread ID.',
    error: '',
  };
  const key = 'hashbrown:production:/api/production/run:thread';
  const mutable = () =>
    !disposed &&
    active() &&
    !store.getSnapshot().readOnly &&
    store.getSnapshot().cursor === null &&
    !state.busy &&
    !sdk().busy &&
    store.getSnapshot().status !== 'loading';
  const update = (next: Partial<ProductionClientState>) => {
    state = { ...state, ...next };
    store.recordProduction(state);
  };
  const fail = (error: unknown) =>
    update({
      busy: false,
      disposition: 'unknown',
      error: `${error instanceof Error ? error.message : String(error)} Run the local production reference with Postgres; the public anonymous workbench does not provide this endpoint.`,
    });
  const remember = () => {
    try {
      storage?.().setItem(key, state.threadId);
    } catch {
      /* Storage is optional; server remains authoritative. */
    }
  };
  const select = (threadId: string) => {
    if (!mutable()) return;
    nonce++;
    update({
      threadId,
      attachedThreadId: '',
      disposition: 'unread',
      application: null,
      error: '',
      operation: 'Thread selected; explicitly read recovery before sending.',
    });
    remember();
  };
  const current = (token: number, threadId: string, revision: number) =>
    !disposed &&
    token === nonce &&
    active() &&
    !store.getSnapshot().readOnly &&
    store.getSnapshot().cursor === null &&
    state.threadId === threadId &&
    sdk().revision === revision &&
    !sdk().busy;
  return {
    state: () => state,
    mutable,
    /** Remembers only the thread identifier; never stores history or approval grants. */
    mount() {
      if (!mutable()) return;
      try {
        const saved = storage?.().getItem(key);
        if (saved) select(saved);
      } catch {
        /* Optional storage. */
      }
      store.recordProduction(state);
    },
    select,
    /** Creates a durable thread; this does not run the model. */
    async create() {
      if (!mutable()) return;
      const token = ++nonce;
      const revision = sdk().revision;
      const previous = state.threadId;
      update({ busy: true, operation: 'Creating server thread', error: '' });
      try {
        const response = await request('/api/production/threads', {
          method: 'POST',
        });
        if (!response.ok)
          throw new Error(`Create thread failed (${response.status}).`);
        const value = (await response.json()) as { threadId?: unknown };
        if (!current(token, previous, revision)) return;
        if (
          typeof value.threadId !== 'string' ||
          !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.threadId)
        )
          throw new Error('Invalid thread identifier.');
        update({
          threadId: value.threadId,
          attachedThreadId: '',
          busy: false,
          disposition: 'unread',
          application: null,
          operation: 'Thread created; read recovery to attach it to the SDK.',
        });
        remember();
      } catch (error) {
        if (current(token, previous, revision)) fail(error);
      } finally {
        if (token === nonce && state.busy) update({ busy: false });
      }
    },
    /** Reads authoritative state and explicitly restores without generating or resuming. */
    async read(applicationOnly = false) {
      if (!mutable() || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(state.threadId))
        return;
      const token = ++nonce;
      const threadId = state.threadId;
      const revision = sdk().revision;
      update({
        busy: true,
        operation: applicationOnly
          ? 'Reading application receipt'
          : 'Reading authoritative recovery',
        error: '',
      });
      try {
        const response = await request(
          `/api/production/threads/${encodeURIComponent(threadId)}/recovery`,
        );
        if (!response.ok)
          throw new Error(`Recovery read failed (${response.status}).`);
        const recovery = readProductionRecovery(await response.json());
        if (!current(token, threadId, revision)) return;
        if (recovery.snapshot.threadId !== threadId)
          throw new Error('Recovery thread changed.');
        if (
          !applicationOnly &&
          (recovery.disposition === 'idle' || recovery.disposition === 'paused')
        ) {
          sdk().restore(recovery.snapshot, { expectedRevision: revision });
          update({ attachedThreadId: threadId });
        }
        update({
          busy: false,
          disposition: recovery.disposition,
          application: recovery.application,
          operation: applicationOnly
            ? 'Application receipt observed; SDK history unchanged.'
            : `Recovery read: ${recovery.disposition}.`,
        });
      } catch (error) {
        if (current(token, threadId, revision)) fail(error);
      } finally {
        if (token === nonce && state.busy) update({ busy: false });
      }
    },
    /** Captures the native pause for the current request without treating it as a recovery read. */
    observe() {
      if (
        disposed ||
        !active() ||
        store.getSnapshot().readOnly ||
        store.getSnapshot().cursor !== null
      )
        return;
      const observation = sdk();
      const events = store.getSnapshot().events;
      const origin = events
        .map((event) => event.kind === 'resume' || event.kind === 'user')
        .lastIndexOf(true);
      const terminal =
        origin < 0
          ? undefined
          : events
              .slice(origin + 1)
              .find(
                (event) =>
                  event.kind === 'event' &&
                  !!event.payload &&
                  typeof event.payload === 'object' &&
                  ['RUN_FINISHED', 'RUN_ERROR'].includes(
                    String((event.payload as { type?: unknown }).type),
                  ),
              );
      if (observation.busy) observedWork = true;
      else if (observedWork || terminal) {
        observedWork = false;
        if (!observation.pending && store.getSnapshot().status === 'loading')
          store.settle(
            observation.error ||
              observation.recoveryRequired ||
              (terminal?.payload as { type?: string } | undefined)?.type ===
                'RUN_ERROR'
              ? 'error'
              : 'complete',
            observation.finishReason,
          );
      }
      if (
        mutable() &&
        state.attachedThreadId === state.threadId &&
        sdk().pending &&
        state.operation ===
          'Run started; read recovery or application after it finishes.'
      )
        update({
          disposition: 'paused',
          operation: 'Native SDK approval pause observed.',
        });
    },
    /** Requires authoritative idle state before a new user action. */
    sendable: () =>
      mutable() &&
      !!state.threadId &&
      state.attachedThreadId === state.threadId &&
      state.disposition === 'idle' &&
      !sdk().pending,
    /** Resolves exactly the current native batch, echoing opaque server metadata. */
    approve(approved: boolean) {
      const batch = sdk().pending;
      if (
        !mutable() ||
        !state.threadId ||
        state.attachedThreadId !== state.threadId ||
        !['idle', 'paused'].includes(state.disposition) ||
        !batch ||
        !store.beginResume(batch.id)
      )
        return;
      update({
        disposition: 'unknown',
        operation: approved
          ? 'Explicit approval submitted'
          : 'Explicit decline submitted',
      });
      try {
        sdk().resume({
          batchId: batch.id,
          entries: batch.interrupts.map((entry) => ({
            interruptId: entry.id,
            status: approved ? ('resolved' as const) : ('cancelled' as const),
            ...(approved ? { payload: 'once' } : {}),
            ...(entry.metadata ? { metadata: entry.metadata } : {}),
          })),
        });
      } catch (error) {
        store.failResume();
        fail(error);
      }
    },
    /** Requires an explicit authoritative reread after a run or uncertain outcome. */
    ran() {
      if (state.disposition !== 'unknown')
        update({
          disposition: 'unknown',
          operation:
            'Run started; read recovery or application after it finishes.',
        });
    },
    dispose() {
      disposed = true;
      nonce++;
    },
  };
}
