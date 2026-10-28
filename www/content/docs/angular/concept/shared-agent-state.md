---
title: 'Shared Agent State: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Share structured context with an agent and follow its updates. Follow the canonical Angular workbench.'
---

# Shared Agent State

<p class="subtitle">Share structured context with an agent and follow its updates.</p>

<hb-workbench lesson="shared-state">
</hb-workbench>

Let's keep the same two-step plan: outline a trusted UI demo, then record it. Change its title in the app and select **Set shared state**. Nothing runs yet. Send a message, and watch the agent read that value, stream its reply, and update the shared state.

The State inspector follows the selected timeline frame. The title field is an application form draft; the SDK state is a separate value. You can see exactly when the app replaces it and when the agent updates it. The captured side shows SDK state and request flags. The other side shows the local form and accepted application plan. Choose Raw for the full selected SDK observation.

<img src="/video/docs/canonical-workbench-shared-state-angular-result.png" alt="Angular workbench showing shared agent state, the chat, paired inspector, and bottom player." width="1600" height="1000" loading="lazy" />

Run the [canonical workbench](/docs/angular/start/workbench), then open [`/angular.html?lesson=shared-state`](http://127.0.0.1:4370/angular.html?lesson=shared-state). The recording uses the [checked Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/workflow-workbench.ts) and [local agent](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-workflows.ts).

The client makes real Hashbrown requests. The local AG-UI agent explicitly maps shared state into model instructions and wraps the provider's streamed text with workflow events. Direct provider adapters do not create these events or approval decisions automatically.

## Initialize a Small State Value

Keep shared state focused on the context both the app and agent need. Our plan has a title and a status. The two plan steps remain application-owned data.

<hb-code-example header="runtime/workbench-workflows.ts">

```ts
export interface WorkbenchWorkflowState {
  readonly planTitle: string;
  readonly status: 'idle' | 'draft' | 'ready';
}
/** The same application-owned plan is used in all three workflow lessons. */
export const workbenchWorkflowPlan = {
  title: 'Show how a model renders trusted UI',
  steps: ['Outline the trusted UI demo.', 'Record the demo.'],
} as const;
/** Initial shared SDK state; editing it does not start generation. */
export const workbenchWorkflowInitialState: WorkbenchWorkflowState = {
  planTitle: workbenchWorkflowPlan.title,
  status: 'idle',
};
```

</hb-code-example>

Pass `state: workbenchWorkflowInitialState` to `chatResource`. Read the current value from `chat.state()`. TypeScript infers the state type from the initial value; without an initial value, state starts as `undefined`.

## Replace State Explicitly

`setState` replaces the complete value. It does not merge objects and does not start a generation. The workbench first records a local title draft, then calls the SDK setter when you select **Set shared state**. Send starts the request separately.

<hb-code-example header="angular/src/app/workflow-workbench.ts">

```ts
  applyState(): void {
    if (!canEditWorkflowState(this.store.getSnapshot())) return;
    const state = {
      ...(this.chat.state() ?? workbenchWorkflowInitialState),
      planTitle:
        readWorkflowForm(this.store.getSnapshot()).title ?? this.title(),
    };
    if (!isWorkbenchWorkflowState(state)) return;
    try {
      this.chat.setState(state);
    } catch (error) {
      this.localError.set(String(error));
    }
  }
```

</hb-code-example>

Values must be JSON-compatible: null, strings, booleans, finite numbers, arrays, and plain objects. Nested `undefined`, sparse arrays, cycles, functions, symbols, bigints, non-finite numbers, and class instances such as `Date` are rejected. Invalid values throw synchronously and preserve the previous state.

## Follow Drafts and Commits

The agent emits `STATE_SNAPSHOT` with status `draft`. After the provider completes its explanation, it emits `STATE_DELTA` to replace that status with `ready`. The inspector labels state as a draft while the request is running. Seeing the final patch does not, by itself, prove the run committed.

A successful run commits the draft. A failed, cancelled, retired, or retried attempt rolls back to its starting checkpoint. This local agent treats a truncated, refused, filtered, or missing provider completion as an error, so it cannot publish those attempts as a completed workflow.

`setState` throws while a logical generation is scheduled or running, including debounce, retry backoff, and retries. An interrupt commits a checkpoint; the SDK allows local state changes while paused and locks writes again when resume is scheduled. This workbench keeps its title editor locked during approvals so the form stays focused on the pending decisions.

## Keep State and Model Context Explicit

Shared state travels in the AG-UI request. Your agent must decide how to use it. Our local agent validates it and includes it in provider instructions. That mapping supplies context; it does not grant authorization.

The State panel also shows the workbench's accepted application plan and revision. Those values are separate from shared SDK state. Replaying a frame changes what you inspect without changing the live conversation or making another request.

## The Run's Return Value

An agent can attach a return value to the AG-UI `RUN_FINISHED` event, separate from the messages and from shared state. Hashbrown exposes it as `lastRunResult` on `chatResource()` and the other chat and completion APIs.

```ts
const result = chat.lastRunResult();
```

The value is the return value of the last run that completed, as any JSON value, or `undefined` when the agent attached none. It is cleared when the next run starts, so a value always belongs to the messages currently shown. Interrupted, cancelled, and failed runs never set it. When one turn spans several runs because the model called your tools, each completed run replaces the value, so you read what the final run returned.

Hashbrown's direct provider adapters do not produce a return value. Use it with an agent implementation that sets `result` on its terminal event.

---

## Token Usage and Finish Reason

Hashbrown also reads how the last completed run ended. `lastRunUsage` holds the token counts from AG-UI's standard `RUN_FINISHED.usage` field, one entry per provider and model. `lastRunFinishReason` says why the model stopped.

```ts
const usage = chat.lastRunUsage(); // TokenUsage[] | undefined
const reason = chat.lastRunFinishReason(); // FinishReason | undefined

if (reason === 'length') {
  // The answer was cut off by the output token limit.
}
```

`lastRunFinishReason` is one of:

| Reason           | Meaning                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `stop`           | The model finished its answer.                                                            |
| `length`         | An output token limit or the context window cut the answer off.                           |
| `tool_calls`     | The model stopped to call tools.                                                          |
| `content_filter` | A provider safety filter or guardrail blocked or cut the answer, or blocked the prompt.   |
| `refusal`        | The model declined to answer.                                                             |
| `other`          | Any other reason. The provider's own reason is kept in the `RUN_FINISHED` event metadata. |

A truncated, filtered, or refused answer is not an error. The run completes, the partial answer stays in the messages, and the finish reason tells you what happened, so check it when you need to tell the user that an answer was cut off or blocked. Hashbrown's provider packages always report a finish reason, and they report usage whenever the provider does.

Both values follow the same lifecycle as `lastRunResult`: they are cleared when the next run starts and never set by interrupted, cancelled, or failed runs. When one turn spans several runs because the model called your tools, you read the final run's usage, not the turn's total.

Each usage entry follows AG-UI's accounting. `inputTokens` and `outputTokens` are totals. `cachedInputTokens`, `cacheWriteInputTokens`, and `reasoningTokens` are parts of those totals, never additions to them. `totalTokens` is their sum.

For request-level troubleshooting, see [Debugging](/docs/angular/concept/debugging). Continue with [Activities](/docs/angular/concept/activities) or [Interrupt and Resume](/docs/angular/concept/interrupt-and-resume).
