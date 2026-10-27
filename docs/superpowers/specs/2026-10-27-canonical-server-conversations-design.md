# Canonical server conversations

Continue the approved canonical rollout with `server-threads` and `public-endpoint` in Angular and React. Keep the LLA shell, chat feed, paired inspector, inert historical playback and bottom timeline. No dependencies or SDK release.

## Teaching contract

Server threads uses real text chat, application-provisioned Lighthouse/Harbor server records, explicit load/save, optimistic versions, hard refresh, and a genuine stale-version conflict. Persistence contains bounded successful completed text, never agent checkpoints. Server storage is process-local demonstration storage; it survives browser refresh only. SDK thread identity must honestly match the loaded server thread; load completes before enabling send. Empty snapshots load without generation. Failed load/save/conflict preserves unsaved text and last known version until explicit reload. No automatic save or retry. A competing save must be a real independent HTTP write, clearly labelled, not a fabricated 409.

Public endpoints uses the same real SDK and conversation. Show an actual unauthenticated denial, explicit local demo session, successful model stream, and foreign-owner denial. Authentication, origin, input, ownership and admission checks precede provider calls. The local session is deliberately a demo integration, never a production sign-in implementation. Provider keys and session secrets stay out of capture. Capture HTTP status, safe operation metadata, version and last server snapshot alongside actual SDK messages. Never imply Origin/CORS is authentication. Preserve disconnect handling and bounded input.

## Architecture

Reuse `createThreadApp` and `ThreadStore` where practical behind an isolated `/api/workbench/server` router, with safe source/provenance headers. Provision separate lesson records per isolated browser demo session so repeat runs do not inherit others' history. Identity is server-minted and cookie-based, with HttpOnly/SameSite protections and loopback/demo limitations clearly documented. Reuse strict workbench text codec and history observation/replacement/save guards. A shared server client/controller owns async operations and cancellation; framework components bind actual useChat/chatResource and real thread IDs. Capture safe HTTP operations into immutable app snapshots for inspector replay. Block mutation during loading, requests, replacement, historical playback, inactive conversation or disposal; prevent stale async responses after switching.

## Recordings and guides

Four real-provider recordings with MP4/WebM, measured captions, poster, result screenshot and honest walkthrough. Separate deterministic browser coverage exercises both frameworks without keys, including 401/403/404/409/429, storage errors, streaming/save guards and inert replay. Rewrite four guides using checked source excerpts and the user's concise explanatory voice. Update lesson count, media registry/inventory and source links. Preserve legacy examples/media for independent fixtures and bookmarks.

## Completion

Build, test, lint www; strict workbench build; full browser matrix; route report; media QA. Independent review. PR, integrate main changes as needed, merge only when required checks are green. Verify production deployment, guides and videos. User handles SDK release.
