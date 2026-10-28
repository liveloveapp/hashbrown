import {
  getNativeLanguageModel,
  type NativeLanguageModel,
  prepareLocalModel,
} from './local-models';
import {
  isCurrentWorkbenchError,
  isWorkbenchPlan,
  type WorkbenchSnapshot,
  type WorkbenchStore,
  workbenchStructuredProps,
} from './workbench';
import {
  canAcceptSummary,
  type ProposalOrigin,
  type SummaryProps,
} from './workbench-view';

/** Owns one explicit preparation gesture and invalidates late native callbacks. */
export function createWorkbenchLocalController(options: {
  readonly store: WorkbenchStore;
  readonly active: () => boolean;
  readonly model?: () => NativeLanguageModel | undefined;
}) {
  const { store } = options;
  let disposed = false;
  let prepared = false;
  let pending:
    { readonly id: string; readonly controller: AbortController } | undefined;
  const mutable = () =>
    !disposed && options.active() && store.getSnapshot().cursor === null;
  const ready = () =>
    prepared && store.getSnapshot().frame?.localModel?.state === 'ready';
  const canSend = () =>
    mutable() &&
    ready() &&
    !pending &&
    !['loading', 'paused'].includes(store.getSnapshot().status);
  const stop = () => {
    const operation = pending;
    if (!operation) return;
    pending = undefined;
    prepared = false;
    operation.controller.abort();
    store.recordLocalPreparation({
      operationId: operation.id,
      state: 'cancelled',
    });
  };
  const unsubscribe = store.subscribe(() => {
    if (pending && !mutable()) stop();
  });
  return {
    ready,
    preparing: () => !!pending,
    canSend,
    mutable,
    stop,
    async prepare(): Promise<void> {
      if (!mutable() || pending || store.getSnapshot().status === 'loading')
        return;
      const id = `local-preparation-${globalThis.crypto.randomUUID()}`;
      const operation = { id, controller: new AbortController() };
      pending = operation;
      if (!store.beginLocalPreparation(id)) {
        pending = undefined;
        return;
      }
      prepared = false;
      const current = () =>
        pending === operation &&
        !operation.controller.signal.aborted &&
        mutable();
      try {
        await prepareLocalModel({
          model: (options.model ?? getNativeLanguageModel)(),
          signal: operation.controller.signal,
          onProgress: (progress) => {
            if (current())
              store.recordLocalPreparation({
                operationId: id,
                state: 'preparing',
                progress,
              });
          },
        });
        if (!current()) return;
        pending = undefined;
        prepared = true;
        store.recordLocalPreparation({ operationId: id, state: 'ready' });
      } catch (error: unknown) {
        if (!current()) return;
        pending = undefined;
        prepared = false;
        store.recordLocalPreparation({
          operationId: id,
          state: 'error',
          issue: (error instanceof Error
            ? error.message
            : 'Model preparation failed. Select Prepare model to retry.'
          ).slice(0, 2000),
        });
      }
    },
    dispose(): void {
      stop();
      disposed = true;
      prepared = false;
      unsubscribe();
    },
  };
}

/** Renders explicit preparation controls using immutable captured facts in replay. */
export function mountWorkbenchLocalControls(
  host: HTMLElement,
  store: WorkbenchStore,
  controller: ReturnType<typeof createWorkbenchLocalController>,
) {
  const controls = document.createElement('div');
  controls.className = 'wb-local-controls';
  const prepare = document.createElement('button');
  prepare.type = 'button';
  prepare.textContent = 'Prepare model';
  prepare.setAttribute('data-local-prepare', '');
  prepare.addEventListener('click', () => {
    if (!prepare.disabled) void controller.prepare();
  });
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.textContent = 'Stop preparation';
  stop.addEventListener('click', () => {
    if (!stop.disabled) controller.stop();
  });
  const status = document.createElement('span');
  status.className = 'wb-muted';
  status.setAttribute('role', 'status');
  status.setAttribute('data-local-model-status', '');
  controls.append(prepare, stop, status);
  host.append(controls);
  const render = () => {
    const snapshot = store.getSnapshot();
    const state = snapshot.frame?.localModel;
    const replay = snapshot.cursor !== null;
    const preparing =
      state?.state === 'preparing' && (replay || controller.preparing());
    prepare.disabled =
      replay ||
      !controller.mutable() ||
      preparing ||
      snapshot.status === 'loading';
    stop.disabled = replay || !controller.mutable() || !preparing;
    status.textContent = `${replay ? 'Replay · ' : ''}${state?.state === 'ready' ? 'Model ready · generation stays on this device.' : preparing ? `Preparing model${state.progress === undefined ? '…' : ` · ${state.progress}%`}` : state?.state === 'error' ? state.issue : state?.state === 'cancelled' ? 'Preparation stopped. Select Prepare model to retry.' : 'Select Prepare model to check Chrome availability.'}`;
  };
  const unsubscribe = store.subscribe(render);
  render();
  return {
    dispose() {
      unsubscribe();
      controls.remove();
    },
  };
}

/** Requires the unmodified native JSON document as well as current application provenance. */
export function canAcceptWorkbenchLocalPlan(
  snapshot: WorkbenchSnapshot,
  origin: ProposalOrigin,
  proposal: SummaryProps,
  used: boolean,
): boolean {
  if (
    snapshot.frame?.localModel?.state !== 'ready' ||
    !canAcceptSummary(snapshot, origin, proposal, used)
  )
    return false;
  try {
    const original = workbenchStructuredProps(
      JSON.parse(snapshot.frame?.json ?? ''),
    );
    return (
      isWorkbenchPlan(original) &&
      original.title === proposal.title &&
      original.steps.length === proposal.steps.length &&
      original.steps.every((step, index) => step === proposal.steps[index])
    );
  } catch {
    return false;
  }
}

/** Captures only the active user turn and distinguishes native EOF from a partial preview. */
export function observeWorkbenchLocalRun(
  store: WorkbenchStore,
  run: {
    readonly active: boolean;
    readonly messages: readonly {
      readonly id?: string;
      readonly role: string;
      readonly content?: unknown;
    }[];
    readonly origins: Readonly<Partial<Record<string, ProposalOrigin>>>;
    readonly busy: boolean;
    readonly error?: unknown;
    readonly previousError?: unknown;
    readonly finishReason?: string;
    readonly interrupted?: boolean;
  },
): void {
  const snapshot = store.getSnapshot();
  if (!run.active || snapshot.cursor !== null || snapshot.status !== 'loading')
    return;
  const current = isCurrentWorkbenchError(snapshot, run.messages);
  if (!current) return;
  if (
    run.error &&
    isCurrentWorkbenchError(
      snapshot,
      run.messages,
      run.error,
      run.previousError,
    )
  ) {
    store.settle('error');
    return;
  }
  const message = [...run.messages]
    .reverse()
    .find((candidate) => candidate.role === 'assistant');
  const origin = message?.id ? run.origins[message.id] : undefined;
  if (
    !message ||
    origin?.turn !== snapshot.turn ||
    origin.revision !== snapshot.application.revision
  )
    return;
  store.parsed(message.content);
  if (run.busy) return;
  const finished = snapshot.events.some(
    (event) =>
      event.turn === snapshot.turn &&
      event.kind === 'event' &&
      event.payload &&
      typeof event.payload === 'object' &&
      'type' in event.payload &&
      event.payload.type === 'RUN_FINISHED',
  );
  if (!finished) return;
  store.settle(
    !run.interrupted &&
      (run.finishReason === undefined || run.finishReason === 'stop') &&
      finished
      ? 'complete'
      : 'error',
    run.finishReason ?? (finished ? 'stop' : undefined),
  );
}
