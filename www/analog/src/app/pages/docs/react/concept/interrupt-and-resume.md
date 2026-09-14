---
title: 'Interrupt and Resume: Hashbrown React Docs'
meta:
  - name: description
    content: 'Respond to AG-UI interrupt batches and resume agent workflows in React.'
---

# Interrupt and Resume

<p class="subtitle">Pause an agent workflow, collect answers, and resume from its committed checkpoint.</p>

An AG-UI agent can finish a run with an interrupt outcome when it needs approval or structured input. Hashbrown commits the streamed state and message history, exposes the complete batch through `pendingInterrupts`, and stops automatic tool execution and continuation.

These APIs are available on text, structured, and UI chat and completion hooks. Your endpoint must implement the protocol-standard interrupt outcome and `resume` request array.

## Read a Batch

`pendingInterrupts` is `undefined` when there is no pending batch. Otherwise, it contains an opaque local `id` and a readonly `interrupts` array. Each interrupt retains its protocol `id`, `reason`, and optional `message`, `toolCallId`, `responseSchema`, `expiresAt`, `metadata`, and `subagentRunId`.

`responseSchema` is the server's JSON Schema object, preserved as immutable data. Your application can use it to build a form and validate answers. Hashbrown checks JSON compatibility and batch ownership but does not compile a JSON Schema validator.

Keep form drafts associated with the batch ID originally displayed. Do not substitute the newest batch ID when submitting an old form.

## Submit Every Response Together

Pass `resume({ batchId, entries })` exactly one entry for each pending interrupt. One unanswered interrupt holds up the entire batch. Applications may collect answers across separate screens, but Hashbrown does not store partial answers.

For example, a workflow with purchase approval and an address question can submit:

```ts
chat.resume({
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

Invalid, incomplete, duplicate, stale, or expired submissions throw synchronously without sending a request. Handle these API errors in your form submission handler. Execution errors appear in `chat.error`.

## Show Resume Progress

While awaiting answers, `isLoading` and `isResuming` are false. Calling resume claims the batch synchronously, sets both flags, and prevents duplicate submissions. The batch stays visible until the server's matching `RUN_STARTED` arrives.

After that event, the old batch disappears, while `isResuming` stays true through any new local tools and follow-up runs. Disable submission controls while resuming. A fresh interruption publishes a new batch ID, even if the server reuses its interrupt IDs.

The local batch ID belongs to the runtime. It is not part of shared AG-UI state and is not sent to the server.

## State, Tools, and New Input

You may call `setState()` while awaiting answers. Resume captures the latest committed state and canonical history; state writes lock synchronously when the batch is claimed. State changes alone never resume a run.

While a batch is pending or claimed, ordinary sends, message replacement, and reload are rejected. Resume sends responses to the server; it does not execute saved tool calls locally. A subsequent server result can refer to the original tool-call ID. Only genuinely new eligible calls enter ordinary local execution after a successful run.

Completion hooks defer input changes during a pause or resumed interaction. If input changes from A to B to C, resume still answers A. After the whole interaction succeeds, only C starts a new completion. Another interrupt keeps C deferred; failure or stop does not automatically send C.

## Retry, Stop, and Recovery

Before matching `RUN_STARTED`, configured retries reuse the captured checkpoint and answers. Failure or stop before that event releases the claim, so the same batch can be submitted again if it has not expired. A lost connection does not prove the server never received the request; the endpoint must handle identical resume decisions idempotently.

After matching `RUN_STARTED`, Hashbrown does not automatically replay the resume. Failure or stop requires a new thread before further requests. Later follow-up runs retain ordinary retries, but terminal failure anywhere in the resumed interaction still requires a new thread. Earlier committed checkpoints and tool effects are preserved.

Hashbrown checks expiration before claiming and immediately before each send. If any interrupt expires, the entire batch remains visible but cannot resume. Start a new thread to continue; this starts a new workflow rather than repairing the expired one.

Changing to a different `threadId` retires local batch ownership and late callbacks, preserving committed messages/state. Setting the same ID does not reset a pause or recovery requirement. Changing threads does not cancel work on the server.

## Runtime Lifetime

Pending batches exist only within the live runtime. Page reloads and runtime recreation do not restore them. Saving the batch ID and form answers is not sufficient to restore the canonical checkpoint. Reusing an old thread ID does not recover its interrupt workflow.

For shared checkpoint behavior, see [Shared Agent State](/docs/react/concept/shared-agent-state) and [Message History](/docs/react/concept/message-history).
