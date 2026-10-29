---
title: 'Interrupt and Resume: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Pause for a decision, then continue the same turn. Follow the canonical Angular workbench.'
---

# Interrupt and Resume

<p class="subtitle">Pause for a decision, then continue the same turn.</p>

<hb-workbench lesson="interrupts">
</hb-workbench>

Let's explain the same two-step plan, pause for two approvals, and continue once both answers are ready. The chat keeps the original user turn. Resume sends decisions; it does not add a pretend user message.

Approval in this example permits another explanation. It does not execute either plan step, record a video, or write a file. A later user turn creates a fresh approval batch with fresh form choices.

<img src="/video/docs/canonical-workbench-interrupts-angular-result.png" alt="Angular workbench showing interrupt and resume, the chat, paired inspector, and bottom player." width="1600" height="1000" loading="lazy" />

Run the [canonical workbench](/docs/angular/start/workbench), then open [`/angular.html?lesson=interrupts`](http://127.0.0.1:4370/angular.html?lesson=interrupts). The recording uses the [checked Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/workflow-workbench.ts) and [local agent](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-workflows.ts).

The client makes real Hashbrown requests. The local AG-UI agent explicitly maps shared state into model instructions and wraps the provider's streamed text with workflow events. Direct provider adapters do not create these events or approval decisions automatically.

## Read the Whole Pending Batch

The agent ends a run with an interrupt outcome. Hashbrown commits its message and state checkpoint, exposes `pendingInterrupts`, and stops automatic continuation. Read it from `chat.pendingInterrupts()`. It is `undefined` when no batch is pending.

A pending batch has an opaque local `id` and an immutable `interrupts` array. Each interrupt preserves the server's ID, reason, message, `responseSchema`, expiry, and optional tool, metadata, and subagent fields. Our server asks two questions with the same boolean-object schema:

```json
{
  "type": "object",
  "properties": { "approved": { "type": "boolean" } },
  "required": ["approved"],
  "additionalProperties": false
}
```

Hashbrown preserves `responseSchema` as data. Your form must validate answers; the server must validate them again. Hashbrown checks JSON compatibility and batch ownership rather than compiling a JSON Schema validator.

## Submit Every Answer Together

The paired inspector shows the SDK batch beside the application form and request outcome. Raw retains the full selected SDK observation.

Keep form drafts attached to the original displayed `batchId`. Do not replace it with a newer batch ID when submitting an old form. One unanswered question holds up the whole batch.

The workbench builds a complete `resume` argument from the original batch:

<hb-code-example header="runtime/workbench-workflow-form.ts">

```ts
  return {
    batchId,
    entries: batch.interrupts.map(({ id }) =>
      cancel
        ? { interruptId: id, status: 'cancelled' as const }
        : {
            interruptId: id,
            status: 'resolved' as const,
            payload: { approved: answers[id] === 'approve' },
          },
    ),
  };
}
```

</hb-code-example>

A resolved answer with `{ approved: false }` is a denial. A cancelled entry has `status: 'cancelled'` and no payload. **Cancel approvals** submits cancellation for the whole batch; **Stop** aborts a running request. They have different meanings.

The SDK rejects missing, partial, duplicate, stale, or foreign local batch entries synchronously. The local batch token is not sent over the wire: the endpoint receives the protocol interrupt IDs and decisions. The server independently checks IDs, expiry, payloads, and whether decisions were consumed.

## Resume the Same Turn

Call `resume` once with the complete batch. The SDK claims it synchronously and locks state before scheduling the request. `isResuming` distinguishes this continuation from an ordinary send. The workbench records resume intent before invoking the SDK, so even an immediate request stays in the original turn.

Our server claims the decisions atomically before delegating. If both answers approve, it asks the model for another brief explanation. A denial or cancellation finishes without another provider call. A later ordinary user message starts a new run and creates a fresh approval batch.

## Recover at the Acknowledgement Boundary

Before a matching `RUN_STARTED` acknowledges resume, a failed attempt can release its claim and leave the batch available to retry. A synchronous validation error also leaves the pending form intact.

After acknowledgement, an error or cancellation can require a new thread. Respect the SDK recovery state and offer **New conversation**. Clearing messages or reusing the same thread ID does not reset an acknowledged failure.

Pending batches and form drafts are local runtime state, not durable persisted checkpoints. The example's server approval store is bounded, expires after five minutes, and exists only in that process. Production agents need authenticated ownership, durable checkpoints, and their own policy for retries and protected work. This example does not promise exactly-once execution.

## Replay Without Resubmitting

Select the paused frame to inspect its original batch and the form choices captured at that moment. The controls are disabled during replay. Return to Live to continue with the current batch; replay never submits another decision.

Continue with [Shared Agent State](/docs/angular/concept/shared-agent-state) and [Message History](/docs/angular/concept/message-history).

## Show Resume Progress

While awaiting answers, `isLoading()` and `isResuming()` are false. Calling resume claims the batch synchronously, sets both flags, and prevents duplicate submissions. The batch stays visible until the server's matching `RUN_STARTED` arrives.

After that event, the old batch disappears, while `isResuming()` stays true through any new local tools and follow-up runs. Disable submission controls while resuming. A fresh interruption publishes a new batch ID, even if the server reuses its interrupt IDs.

The local batch ID belongs to the runtime. It is not part of shared AG-UI state and is not sent to the server.

## State, Tools, and New Input

You may call `setState()` while awaiting answers. Resume captures the latest committed state and canonical history; state writes lock synchronously when the batch is claimed. State changes alone never resume a run.

While a batch is pending or claimed, ordinary sends, message replacement, and reload are rejected. Resume sends responses to the server; it does not execute saved tool calls locally. A subsequent server result can refer to the original tool-call ID. Only genuinely new eligible calls enter ordinary local execution after a successful run.

Completion resources defer input changes during a pause or resumed interaction. If input changes from A to B to C, resume still answers A. After the whole interaction succeeds, only C starts a new completion. Another interrupt keeps C deferred; failure or stop does not automatically send C.

## Retry, Stop, and Recovery

Before matching `RUN_STARTED`, configured retries reuse the captured checkpoint and answers. Failure or stop before that event releases the claim, so the same batch can be submitted again if it has not expired. A lost connection does not prove the server never received the request; the endpoint must handle identical resume decisions idempotently.

After matching `RUN_STARTED`, Hashbrown does not automatically replay the resume. Failure or stop requires a new thread before further requests. Later follow-up runs retain ordinary retries, but terminal failure anywhere in the resumed interaction still requires a new thread. Earlier committed checkpoints and tool effects are preserved.

Hashbrown checks expiration before claiming and immediately before each send. If any interrupt expires, the entire batch remains visible but cannot resume. Start a new thread to continue; this starts a new workflow rather than repairing the expired one.

Changing to a different `threadId` retires local batch ownership and late callbacks, preserving committed messages/state. Setting the same ID does not reset a pause or recovery requirement. Changing threads does not cancel work on the server.

## Restore server-owned history

`recovery` exposes a local `{ revision, required }` value (a signal in Angular). Capture its revision before an asynchronous authenticated lookup. `getRecoveryConfiguration()` synchronously returns owned current system text, native tool declarations and forwarded properties/schema without scheduling a run. Pass a compatible server-owned `ConversationSnapshot` to `restoreConversation(snapshot, { expectedRevision })` while idle. Invalid/stale data leaves the runtime unchanged; successful restoration clears obsolete errors and creates fresh local interrupt ownership without network or tool execution. Historical browser tools remain history on restoration and subsequent sends.

Snapshots contain a stable thread ID, canonical native messages, optional shared state and complete interrupts, and configured-system provenance when applicable. Preserve the server's `configuredSystemMessageId` so the original trusted system overlay is adopted exactly once. Snapshots cannot install handlers, change schemas or replace trusted instructions. A saved local batch token is never authority.

Keep the server's operational disposition separate from this runtime API: installing available history does not authorize another send or decision while the effect is busy or unknown. Invalidate lookup guards on thread changes and disposal, reject unknown envelope versions/statuses, and offer explicit refresh or a deliberate new thread. See the [authenticated .NET recovery recipe](/docs/angular/platform/dotnet) for retained-history limits, UI guards and protected operator reconciliation.

Native requests retain cancellation text but strip private runtime provenance. After a cold reload, structured/UI recovery cannot prove that this text is a runtime cancellation marker and rejects it if it does not match the configured response schema. Keep recovery blocked or deliberately start a new thread; do not remove messages, infer ownership from their text, or fabricate provenance. Plain-chat recovery retains this text visibly. In the same runtime and thread, exact echoes of locally owned cancellation markers preserve their private projection behavior.

For a runnable TypeScript/Postgres reference that survives a server restart, see [Durable recovery with b4.run](/docs/angular/platform/b4run). It separates conversation checkpoints, native approval grants, and the application’s accepted plan.
