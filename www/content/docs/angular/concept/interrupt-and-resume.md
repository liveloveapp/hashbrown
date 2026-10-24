---
title: 'Interrupt and Resume: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Respond to AG-UI interrupt batches and resume agent workflows in Angular.'
---

# Interrupt and Resume

<p class="subtitle">Pause an agent workflow, collect answers, and resume from its committed checkpoint.</p>

Some actions need a decision before the agent continues. This example pauses a trip plan, collects two approvals, and resumes once both answers are ready.

<hb-docs-demo demo="interrupts">
</hb-docs-demo>

Your endpoint must emit interrupt outcomes and accept resume requests. The Quickstart’s direct provider endpoint does not create this workflow by itself. See the [recorded example source](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/workflows.ts).

An AG-UI agent can finish a run with an interrupt outcome when it needs approval or structured input. Hashbrown commits the streamed state and message history, exposes the complete batch through the `pendingInterrupts` signal, and stops automatic tool execution and continuation.

These APIs are available on text, structured, and UI chat and completion resources. Your endpoint must implement the protocol-standard interrupt outcome and `resume` request array.

## Read a Batch

<img src="/video/docs/interrupts-approval.png" alt="A paused trip plan asks for itinerary approval and destination confirmation before resuming." width="920" height="206" loading="lazy" />

Read `chat.pendingInterrupts()` to obtain the batch or `undefined`. A batch contains an opaque local `id` and a readonly `interrupts` array. Each interrupt retains its protocol `id`, `reason`, and optional `message`, `toolCallId`, `responseSchema`, `expiresAt`, `metadata`, and `subagentRunId`.

`responseSchema` is the server's JSON Schema object, preserved as immutable data. Your application can use it to build a form and validate answers. Hashbrown checks JSON compatibility and batch ownership but does not compile a JSON Schema validator.

For example, a server can ask for a boolean approval object:

```json
{
  "id": "purchase",
  "reason": "input_required",
  "message": "Approve this purchase?",
  "responseSchema": {
    "type": "object",
    "properties": { "approved": { "type": "boolean" } },
    "required": ["approved"],
    "additionalProperties": false
  }
}
```

Hashbrown preserves that schema object. Your form validates an answer such as
`{ "approved": true }`, and the server remains authoritative about accepting it.

Keep form drafts associated with the batch ID originally displayed. Do not substitute the newest batch ID when submitting an old form.

## Submit Every Response Together

Pass `resume({ batchId, entries })` exactly one entry for each pending interrupt. One unanswered interrupt holds up the entire batch. Applications may collect answers across separate screens, but Hashbrown does not store partial answers.

For example, a workflow with purchase approval and an address question can submit:

```ts
this.chat.resume({
  batchId: displayedBatch.id,
  entries: [
    {
      interruptId: 'purchase',
      status: 'resolved',
      payload: { approved: true },
    },
    {
      interruptId: 'shipping-address',
      status: 'resolved',
      payload: { addressId: 'address-123' },
    },
  ],
});
```

The interrupt IDs and payloads must match the actual batch and schemas supplied by your endpoint. A denial is a `resolved` response with the answer expected by the server, such as `{ approved: false }`. Use `cancelled` without a payload when abandoning an interrupt without an answer. Cancellation entries are still submitted with the entire batch; they do not mean calling `stop()`.

Invalid, incomplete, duplicate, stale, or expired submissions throw synchronously without sending a request. Handle these API errors in your form submission handler. Execution errors appear through the resource's error API.

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

## Runtime Lifetime

Pending batches exist only within the live runtime. Page reloads and runtime recreation do not restore them. Saving the batch ID and form answers is not sufficient to restore the canonical checkpoint. Reusing an old thread ID does not recover its interrupt workflow.

For shared checkpoint behavior, see [Shared Agent State](/docs/angular/concept/shared-agent-state) and [Message History](/docs/angular/concept/message-history).

## Restore server-owned history

`recovery` exposes a local `{ revision, required }` value (a signal in Angular). Capture its revision before an asynchronous authenticated lookup. `getRecoveryConfiguration()` synchronously returns owned current system text, native tool declarations and forwarded properties/schema without scheduling a run. Pass a compatible server-owned `ConversationSnapshot` to `restoreConversation(snapshot, { expectedRevision })` while idle. Invalid/stale data leaves the runtime unchanged; successful restoration clears obsolete errors and creates fresh local interrupt ownership without network or tool execution. Historical browser tools remain history on restoration and subsequent sends.

Snapshots contain a stable thread ID, canonical native messages, optional shared state and complete interrupts, and configured-system provenance when applicable. Preserve the server's `configuredSystemMessageId` so the original trusted system overlay is adopted exactly once. Snapshots cannot install handlers, change schemas or replace trusted instructions. A saved local batch token is never authority.

Keep the server's operational disposition separate from this runtime API: installing available history does not authorize another send or decision while the effect is busy or unknown. Invalidate lookup guards on thread changes and disposal, reject unknown envelope versions/statuses, and offer explicit refresh or a deliberate new thread. See the [authenticated .NET recovery recipe](/docs/angular/platform/dotnet) for retained-history limits, UI guards and protected operator reconciliation.

Native requests retain cancellation text but strip private runtime provenance. After a cold reload, structured/UI recovery cannot prove that this text is a runtime cancellation marker and rejects it if it does not match the configured response schema. Keep recovery blocked or deliberately start a new thread; do not remove messages, infer ownership from their text, or fabricate provenance. Plain-chat recovery retains this text visibly. In the same runtime and thread, exact echoes of locally owned cancellation markers preserve their private projection behavior.
