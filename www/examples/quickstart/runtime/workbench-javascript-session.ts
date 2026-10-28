import type { WorkbenchStore } from './workbench';
import {
  captureWorkbenchJavaScriptValue,
  readWorkbenchJavaScriptPlan,
  type WorkbenchJavaScriptObservation,
  workbenchJavaScriptScripts,
} from './workbench-javascript';

type Run = {
  readonly userId: string;
  readonly abort: AbortController;
  observation: WorkbenchJavaScriptObservation;
};

/** Owns explicit native QuickJS runs and rejects observations outside their live origin. */
export function createWorkbenchJavaScriptSession(options: {
  readonly store: WorkbenchStore;
  readonly active: () => boolean;
  readonly execute: (code: string, signal: AbortSignal) => Promise<unknown>;
}) {
  const { store } = options;
  let disposed = false;
  let running: Run | undefined;
  const current = (run: Run) => {
    const snapshot = store.getSnapshot();
    return (
      !disposed &&
      options.active() &&
      running === run &&
      !run.abort.signal.aborted &&
      snapshot.cursor === null &&
      snapshot.status === 'loading' &&
      snapshot.frame?.messages
        .filter((message) => message.role === 'user')
        .at(-1)?.id === run.userId
    );
  };
  const capture = (run: Run) =>
    store.recordJavaScript(run.observation, run.userId);
  const stop = () => {
    const run = running;
    if (!run) return;
    // Capture the actual cancellation before invalidating this run's origin.
    if (
      store.getSnapshot().cursor === null &&
      store.getSnapshot().status === 'loading'
    ) {
      run.observation = {
        ...run.observation,
        status: 'cancelled',
        outcome: { error: 'Run cancelled' },
      };
      capture(run);
      running = undefined;
      store.settle('cancelled');
    }
    running = undefined;
    run.abort.abort();
  };
  return {
    /** Reports whether an explicit new run can start in this conversation. */
    available(): boolean {
      const snapshot = store.getSnapshot();
      return (
        !disposed &&
        options.active() &&
        !running &&
        snapshot.cursor === null &&
        snapshot.status !== 'loading'
      );
    },
    /** Executes bounded visible source once, forwarding cancellation to the native runtime. */
    async run(code: string, label?: string): Promise<void> {
      if (!this.available() || !code.trim() || code.length > 12_000) return;
      const user = store.send(
        (
          label ||
          (code.length <= 1900 ? code : 'Run the visible JavaScript code.')
        ).slice(0, 2000),
      );
      const run: Run = {
        userId: user.id,
        abort: new AbortController(),
        observation: { runId: user.id, code, status: 'running', calls: [] },
      };
      running = run;
      store.record('source', {
        source:
          'QuickJS · application-rendered runtime result · no model request',
      });
      capture(run);
      try {
        const outcome = captureWorkbenchJavaScriptValue(
          await options.execute(code, run.abort.signal),
        );
        if (!current(run)) return;
        const failed =
          !!outcome && typeof outcome === 'object' && 'error' in outcome;
        run.observation = {
          ...run.observation,
          status: failed ? 'error' : 'complete',
          outcome,
        };
        capture(run);
        store.recordRecipe(
          {
            kind: 'text',
            markdown: `Application-rendered QuickJS ${failed ? 'error' : 'result'}\n${format(outcome)}`,
          },
          user.id,
        );
        running = undefined;
        store.settle(failed ? 'error' : 'complete');
      } catch (error) {
        if (!current(run)) return;
        const outcome = {
          error: error instanceof Error ? error.message : String(error),
        };
        run.observation = { ...run.observation, status: 'error', outcome };
        capture(run);
        store.recordRecipe(
          {
            kind: 'text',
            markdown: `Application-rendered QuickJS error\n${format(outcome)}`,
          },
          user.id,
        );
        running = undefined;
        store.settle('error');
      } finally {
        if (running === run) running = undefined;
        run.abort.abort();
      }
    },
    /** Validates and captures the narrow read-only host capability for the current native run. */
    async readPlan(args: unknown, signal?: AbortSignal) {
      const run = running;
      if (!run || !current(run) || signal?.aborted)
        throw new Error('Runtime origin is no longer active');
      if (run.observation.calls.length >= 32)
        throw new Error('Host call capture limit reached (32 calls per run)');
      try {
        const result = readWorkbenchJavaScriptPlan(
          args,
          store.getSnapshot().application,
        );
        run.observation = {
          ...run.observation,
          calls: [...run.observation.calls, { name: 'readPlan', args, result }],
        };
        capture(run);
        return {
          ...result,
          plan: { ...result.plan, steps: [...result.plan.steps] },
        };
      } catch (error) {
        run.observation = {
          ...run.observation,
          calls: [
            ...run.observation.calls,
            {
              name: 'readPlan',
              args,
              error: error instanceof Error ? error.message : String(error),
            },
          ],
        };
        capture(run);
        throw error;
      }
    },
    /** Cancels native execution and leaves an immutable cancellation observation. */
    stop,
    /** Aborts pending execution and permanently rejects further work. */
    dispose(): void {
      stop();
      disposed = true;
    },
  };
}

function format(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Mounts shared explicit controls and projects only captured, safe text in live and replay modes. */
export function mountWorkbenchJavaScriptSession(
  host: HTMLElement,
  store: WorkbenchStore,
  session: ReturnType<typeof createWorkbenchJavaScriptSession>,
) {
  const root = document.createElement('section');
  root.className = 'wb-runtime';
  const intro = document.createElement('p');
  intro.textContent =
    'Real QuickJS · application-rendered results · no model request. readPlan reads the application-owned plan without changing it. Each run uses a fresh context.';
  const presets = document.createElement('nav');
  presets.setAttribute('aria-label', 'JavaScript script presets');
  const label = document.createElement('label');
  label.textContent = 'JavaScript code';
  const editor = document.createElement('textarea');
  editor.dataset.runtimeCode = '';
  editor.setAttribute('aria-label', 'JavaScript code');
  editor.rows = 8;
  editor.maxLength = 12_000;
  editor.value = workbenchJavaScriptScripts[0].code;
  label.append(editor);
  const buttons = workbenchJavaScriptScripts.map((script) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.runtimePreset = script.id;
    button.textContent = script.title;
    button.onclick = () => {
      if (session.available()) editor.value = script.code;
    };
    presets.append(button);
    return button;
  });
  const run = document.createElement('button');
  run.type = 'button';
  run.className = 'wb-primary';
  run.dataset.runtimeRun = '';
  run.textContent = 'Run in QuickJS';
  run.onclick = () => {
    void session.run(editor.value);
  };
  const output = document.createElement('pre');
  output.dataset.runtimeOutput = '';
  output.className = 'wb-visually-hidden';
  output.setAttribute('aria-live', 'polite');
  const calls = document.createElement('div');
  calls.className = 'wb-visually-hidden';
  const transcript = document.createElement('div');
  transcript.dataset.runtimeMessages = '';
  root.append(intro, transcript, presets, label, run, output, calls);
  host.append(root);
  let wasHistorical = false;
  const update = () => {
    const snapshot = store.getSnapshot();
    const captured = snapshot.frame?.javascript;
    const disabled = !session.available();
    editor.disabled = run.disabled = disabled;
    buttons.forEach((button) => {
      button.disabled = disabled;
    });
    if (
      captured &&
      (snapshot.cursor !== null ||
        snapshot.status === 'loading' ||
        wasHistorical)
    )
      editor.value = captured.code;
    wasHistorical = snapshot.cursor !== null;
    output.textContent = captured
      ? `${captured.status}\n${captured.outcome === undefined ? 'Running in QuickJS…' : format(captured.outcome)}`
      : 'Run visible JavaScript in QuickJS.';
    calls.replaceChildren(
      ...(captured?.calls ?? []).map((call) => {
        const pre = document.createElement('pre');
        pre.dataset.runtimeCall = call.name;
        pre.textContent = format(call);
        return pre;
      }),
    );
    transcript.replaceChildren(
      ...(snapshot.frame?.messages ?? []).map((message) => {
        const text = document.createElement(
          message.role === 'user' ? 'p' : 'pre',
        );
        text.className =
          message.role === 'user' ? 'wb-user' : 'wb-history-reply';
        text.dataset.messageId = message.id;
        text.textContent = message.content;
        return text;
      }),
    );
  };
  const unsubscribe = store.subscribe(update);
  update();
  return {
    /** Refreshes active state after framework navigation without recording a frame. */
    update,
    /** Removes subscriptions and owned controls. */
    dispose(): void {
      unsubscribe();
      root.remove();
    },
  };
}
