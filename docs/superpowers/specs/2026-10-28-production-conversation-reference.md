# Production conversation reference

## Scope

Provide a checked TypeScript/Postgres reference using the existing pinned b4.run stack and real Hashbrown Angular and React clients. Keep the canonical LLA workbench, visible inspectors, bottom timeline, and read-only synchronized playback. Publish guides and recorded demos in Brian's plain, task-first voice. No SDK API additions or SDK release.

## Architecture

The application edge verifies an owner before calling a private b4.run runtime. Its runnable local identity adapter uses a signed HttpOnly cookie with a shared secret; the guide explains replacing that adapter with the application's verified account principal. Never trust an owner header or a thread ID as identity. Mutation requests require the configured same origin. Expose a fixed bounded API, not the runtime's arbitrary route surface.

Use b4.run's public static runtime, Postgres checkpointer, thread store, required approval-grant store, and request-scoped Postgres run admission. All request runtime stores use the admission's fenced pool. Use one explicit application namespace. No SQLite or memory fallback when Postgres is missing. Keep provider keys and database credentials on the server.

An authored server tool proposes a fixed two-step recording plan for explicit approval. Its approved action commits the accepted plan and an operation receipt in one Postgres transaction. A unique receipt and owner/version predicates protect this database effect from duplicate application. The browser and model cannot select the owner, bypass approval, or overwrite arbitrary plan fields. Application plan storage is separate from conversation checkpoints. Do not claim exactly-once external effects.

## Recovery and resume

The server exposes an owner-checked recovery read with authoritative AG-UI history projected from durable b4.run state, pending approval descriptors/grants, the accepted plan/revision, and operational disposition. Bind recovery to the current trusted server configuration. Preserve real message IDs and validate projection; reject unsupported shapes rather than inventing history or tool provenance. Restore using existing `restoreConversation` and revision guards. Avoid a client-configured system overlay if it cannot be faithfully bound to the persisted server configuration; server instructions remain pinned regardless.

Loading recovery performs no provider request, tool execution, or accepted-plan write. Clients guard asynchronous loads against thread changes, local SDK revision changes, active work, and disposal. A paused checkpoint restores a fresh local interrupt batch; Resume is a new explicit user decision echoing the opaque grant. Grant consumption and shared admission protect replica races. Busy/stale/unknown outcomes require rereading authoritative status, never automatic approval retry. Interrupted external effects cannot be inferred from a timeout.

## UX

One production-recovery lesson for both frameworks: create a thread, ask for the plan, inspect the real pause, reload/restart the server, explicitly restore, and approve/resume. Show the server plan revision and recovery disposition alongside the actual request, event, JSON, and chat observations. Restoration and application receipt reads are labelled application operations. Playback remains read-only and cannot call the backend or apply the plan.

Keep this executable reference opt-in and separate from the public anonymous workbench backend. Public docs link to the local setup and show real recordings. Do not provision or migrate a production database as part of a docs PR.

## Verification

Write failing tests first for pure validation, projection, ownership, stale recovery, and receipt semantics. Use a uniquely owned disposable Postgres database for restart and two-instance tests: foreign owners get no history or grants; cold restore generates nothing; one approval applies one receipt; duplicate/stale approval does not advance the application revision; racing resumes cannot both execute. Verify both real framework clients and recording playback. No mocked output may enter published recordings.

Run affected build, test, lint, production docs build, route/mobile reports, and relevant browser checks. Review the implementation, create and attach a PR, merge only on required green checks, and verify the deployed guides/media. SDK release is left to Brian.
