---
title: 'Durable recovery with b4.run: Hashbrown React Docs'
meta:
  - name: description
    content: 'Restore a paused conversation from Postgres, inspect its pending approval, and explicitly accept a server-owned plan.'
---

# Durable recovery with b4.run

A durable conversation must survive more than a browser refresh. When an agent pauses before a protected action, we need to retain its checkpoint, verify who may return to it, and distinguish a restored proposal from an applied business result. b4.run supplies durable runtime stores; our application owns identity, authorization, and the effect itself.

For example, a support assistant may prepare a case update and wait for approval. Reading its saved conversation should show the proposal without changing the case. Approval is a new explicit request, and a repeated request must not apply the same update twice.

The workbench later on this page shows that boundary in the separate TypeScript/Postgres production recovery reference: restore a recording plan after restarting the server, then explicitly approve it. It uses b4.run 0.15.5. The public anonymous workbench does not expose this server's recovery routes.

<hb-diagram diagram="b4-durable-ownership">
</hb-diagram>

## Configure durable runtime stores

Use one application namespace across the stores that belong to the same runtime. This reusable server-side factory uses the public b4.run storage APIs. Supply a pool owned by your server; the function does not open a database or start an agent.

```ts
import {
  createPostgresClientToolCallStore,
  createPostgresInterruptGrantStore,
  createPostgresPermissionsStore,
  createPostgresThreadsStore,
  postgresCheckpointer,
  type SqlPool,
} from '@b4run/postgres-storage/node';

export function createConversationStores(
  pool: SqlPool,
  assumeMigrated = false,
) {
  const options = {
    pool,
    schema: 'support_assistant',
    tablePrefix: 'chat',
    assumeMigrated,
  };

  return {
    checkpointer: postgresCheckpointer(options),
    threadsStore: createPostgresThreadsStore(options),
    permissionsStore: createPostgresPermissionsStore(options),
    clientToolStore: createPostgresClientToolCallStore(options),
    grants: createPostgresInterruptGrantStore(options),
  };
}
```

At startup, await each store's `ready()` before admitting requests. Set `assumeMigrated` only after that initialization succeeds. During a run, construct the stores from the request admission's fenced pool and keep the same namespace. Keep the application's case update and idempotency receipt in its own transaction under that authority.

Storage configuration is one part of the integration. Wire the stores into the runtime, require approval grants, and authorize access before dispatch. The [complete server](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/production/app.ts) shows `createPostgresRunAdmission`, the request context, private runtime handler, and application routes together. The recording-plan specialization below explains the ownership and recovery contracts before we run that second implementation.

## Verify the owner before the runtime

The local identity adapter issues a signed HttpOnly anonymous cookie. A shared secret lets independent server instances verify the same cookie. This gives the example a stable browser identity; it is not account login or cross-device authentication.

For an account application, replace that adapter with your authenticated principal. Include the tenant or issuer in the ownership boundary where needed. Resolve the owner on the server before looking up a thread, reading recovery, or starting a run. Neither a supplied owner header nor knowledge of a thread ID proves ownership.

The edge checks the configured same origin for mutations and exposes only the bounded application routes:

| Route                                      | Purpose                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `POST /api/production/threads`             | Create an owner-scoped thread.                                     |
| `POST /api/production/run`                 | Start or explicitly resume a native AG-UI run.                     |
| `GET /api/production/threads/:id/recovery` | Read authorized history, pending approvals, and application state. |

Keep the private runtime's arbitrary route surface behind this boundary. Keep provider keys, database credentials, system instructions, model selection, and tool implementations on the server.

## Give each durable value a job

The b4.run Postgres checkpointer saves runtime progress. Its thread store indexes durable conversations. Its required approval-grant store binds a pending decision to a single-use grant. Request-scoped Postgres run admission coordinates competing replicas; every runtime store in that request uses the admission's fenced pool and the same explicit application namespace, `hashbrown_production`.

The application stores the accepted recording plan separately. The server tool selects a fixed title and two fixed steps. Neither the model nor the browser can choose another owner or replace arbitrary plan fields.

On approval, one database transaction checks the owner and expected application revision, writes the accepted plan, and records a unique operation receipt. Repeating the same operation cannot advance the plan a second time. This protects this database effect. It does not make an email, payment, file write, or other external effect exactly once. Those operations need their own idempotency and reconciliation policy.

<hb-diagram diagram="b4-recording-plan-erd">
</hb-diagram>

## Restore without running

A recovery envelope separates the configuration identifier, operational disposition, canonical conversation snapshot, and application result. This focused shape shows the reference contract; `threadId`, `messages`, `state`, and `interrupts` come from an authorized server lookup:

```ts
({
  configuration: 'recording-plan-v1',
  disposition: 'paused',
  snapshot: { threadId, messages, state, interrupts },
  application: { revision: 0, plan: null },
});
```

The server derives messages and interrupts from durable native state. It preserves real message IDs and rejects unsupported projections. It does not invent assistant replies, tool provenance, or a transcript from the accepted plan.

The client validates the envelope and binds it to the current trusted server configuration. This plain-chat reference has no client `system` option or browser tools. The server pins its instructions, so a client overlay cannot silently change the recovered agent.

Capture the local SDK recovery revision before the asynchronous read. Apply the snapshot with `restoreConversation(snapshot, { expectedRevision })` only while idle, for the same selected thread, and while that revision still matches. Retire the lookup on thread changes and disposal. A late response must not overwrite a newer conversation.

Restoration installs history without a network request, tool execution, automatic generation, or accepted-plan write. A paused snapshot creates a fresh local interrupt batch. The previous page's local batch ID is not authority.

<hb-diagram diagram="b4-read-then-resume">
</hb-diagram>

## Make resume a new decision

Read the current `pendingInterrupts` batch and attach the form to that exact local batch ID. Resume submits every decision together. For this native approval, the approved payload is `'once'`; echo the opaque grant metadata from the server interrupt. A boolean approval intended for another agent is a different contract.

This focused handler assumes `chat` is the conversation's `useChat` result and `batch` is its current pending batch, captured for the user's explicit approval. The grant metadata belongs to this b4.run server contract.

```ts
chat.resume({
  batchId: batch.id,
  entries: batch.interrupts.map((entry) => ({
    interruptId: entry.id,
    status: 'resolved',
    payload: 'once',
    metadata: entry.metadata,
  })),
});
```

The server validates the decision, consumes the single-use grant, and admits the run through Postgres. A competing replica cannot use the same grant to perform a second acceptance. The local SDK batch guard also prevents submitting an old form against a new batch.

Do not resume automatically from a mount effect, recovery read, or timeline playback. If a resume loses its response, reread authoritative recovery and application state before another decision. A timeout alone does not tell us whether the plan was accepted.

| Disposition | Application behavior                                                       |
| ----------- | -------------------------------------------------------------------------- |
| `idle`      | Show restored history and the current application result.                  |
| `paused`    | Show the fresh pending batch and offer an explicit decision.               |
| `busy`      | Show that server work is active; reread status explicitly.                 |
| `unknown`   | Keep mutations blocked and reconcile the durable result before proceeding. |

Installing available history does not authorize a send while work is busy or its result is unknown. Keep that operational policy separate from the SDK restoration call. Avoid blind approval retries after stale, busy, or unknown outcomes.

## Operate the application

Use a shared cookie secret and Postgres namespace across replicas that serve the same application. The reference binds the application row to `recording-plan-v1` and checks the native trusted route stamp `/recording-plan-v1#agent`. Missing or mismatched configuration blocks run and recovery. Critical instruction or tool changes require a new configuration version and a fresh thread, or an explicit application migration. Do not reinterpret an old checkpoint under new trusted instructions.

Set retention policies for conversation checkpoints, pending grants, thread ownership, accepted plans, and operation receipts. Retain receipts long enough to cover the duplicate requests your application can receive. Deleting a receipt can remove its duplicate protection. Include expiry, sign-out, deletion, access control, backups, and operator reconciliation in your application policy.

Before deploying, use your verified account identity, HTTPS cookie settings, production database access policy, and the admission and failure behavior appropriate to your host. The reference demonstrates one protected database action; it does not provision a production database or deploy an account system.

## Explore it in the workbench

The workbench below replays a recorded run of this lesson.

<hb-workbench lesson="production-recovery">
</hb-workbench>

Let's pause the reference's two-step recording plan, restart the server, and restore the conversation. Then approve the plan and inspect the database result. The conversation checkpoint and accepted plan each have their own job.

This reference uses Hashbrown React, TypeScript, b4.run 0.15.5, and Postgres. It is an opt-in local server with its own database and identity boundary. Run it separately from the public anonymous [conversation workbench](/docs/react/start/workbench).

## Run the reference

Start from a checkout of the [Hashbrown repository](https://github.com/liveloveapp/hashbrown). Install the repository dependencies with `npm ci`. Supply a Postgres database dedicated to this reference and an OpenAI key on the server. The reference creates its storage tables; do not point it at an unrelated database.

```sh
export PRODUCTION_DATABASE_URL='postgresql://localhost/hashbrown_reference'
export PRODUCTION_COOKIE_SECRET='replace-with-a-random-secret-of-at-least-32-characters'
export PRODUCTION_ORIGIN='http://localhost:4310'
export OPENAI_API_KEY='your-server-key'
export OPENAI_MODEL='gpt-4.1-mini'
npx nx workbench-build www
npx nx serve production-reference
```

Keep the same cookie secret, database, and origin when restarting the server. `PORT` defaults to `4310`; update the port and origin together when changing it. There is no memory or SQLite fallback when Postgres is missing.

Open [`/react.html?lesson=production-recovery`](http://localhost:4310/react.html?lesson=production-recovery) on this server. Use `localhost` consistently so the origin and session cookie match.

## Follow the pause across a restart

1. Choose **Create server thread**, then **Read and restore recovery** to attach its empty snapshot. The server records its verified owner.
2. Ask for the recording plan. The server's `acceptPlan` tool pauses for approval before writing the plan.
3. Inspect the pending interrupt, request, events, and current application revision. The plan is still unaccepted at revision `0`.
4. Restart the reference server using the same configuration and refresh the browser.
5. Enter the original **Thread ID** and choose **Read and restore recovery**. Its history and pending approval return without a provider request or plan write.
6. Review the restored proposal and choose **Approve plan**. This explicitly resumes the tool; the accepted plan advances to revision `1`.
7. Choose **Read application receipt** to inspect the database result without replacing SDK history. Replay the captured timeline to review the observations without sending requests or accepting the plan again.

Recovery reads and application receipts are application operations. They appear alongside the actual Hashbrown requests and events. A new page records what it observes after refresh; it does not reconstruct the timing of the original stream.

Read the [checked server source](https://github.com/liveloveapp/hashbrown/tree/main/www/examples/quickstart/server/production) and the [React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/ProductionWorkbench.tsx). Continue with [Interrupt and resume](/docs/react/concept/interrupt-and-resume), [Threads](/docs/react/recipes/threads), and [Securing a public endpoint](/docs/react/recipes/public-endpoint).
