# Decisions in Agents recipe

Continue the approved documentation approach and the user's instruction to finish Decisions in Agents in Brian's voice, add recorded demos, and PR/merge on green. Reuse this isolated worktree on `blove/docs-agent-decisions`, based on current main. Preserve URLs, navigation and typography. SDK release remains separate.

## Bounded workflow

Implement a small server-owned support router using the actual TypeSafe adapter and core `decodeDecision`. A server-pinned schema selects `order`, `returns` or `clarify`; the threshold is 0.7. Reject confidence outside the finite [0, 1] range before routing; decoding alone does not impose that range. The server takes the latest bounded user text from a validated AG-UI request, ignores browser system instructions/state/questions, and invokes only application-owned read-only handlers. Fixed public example data supplies order HB-1042 and a short returns policy. Do not model a refund/payment mutation or imply real account access.

A confident order route still checks the order ID in application code. A missing/unknown ID asks for clarification. Low confidence, an explicit clarify choice, expected `DecisionError`, and malformed decision responses return a safe clarification reply. Do not describe confidence as calibrated correctness. Cancellation propagates before/after the classifier and before handler execution; abort must never become a fallback reply. Unexpected programming failures become a failed run with an explicit retry path. No unbounded model retry loop or fallback language-model call.

The browser uses ordinary `useChat` / `chatResource` over `/api/agent`, not a browser decision hook. React `AgentDecisions` and Angular `AgentDecisions` (`app-agent-decisions`) show a customer-message textarea, explicit Run agent and Cancel actions, status, and a plain-text Agent reply region. Default text: `Where is order HB-1042?`. Each Run replaces messages with a fresh user message, clearing old output; busy includes isSending. Cancellation keeps a visible stopped state, and a later Run recovers. Both clients use application state only, with no persistence.

Keep shared decision schema, validation and routing in checked server files. Separate pure/dependency-injected routing from Express composition and credential-bearing startup. Exports have TSDoc; immutable inputs and top-level arrange/act/assert tests. Add no dependencies or SDK changes. The local listener binds 127.0.0.1:3001; docs state hosted identity, ownership and request controls belong before real customer-data access.

## Editorial

Rewrite both existing recipes around this one complete workflow: purpose, own demo, prerequisites, visible setup, small explanations, expected results, recovery, next steps. Exact checked source goes in closed disclosures; required actions stay visible. Follow Brian's pre-2025 technical posts: concrete goal, approachable “we”/“Let's,” named files, short explanations without unsupported speed/cost claims.

Keep the separate browser-decisions-over-AG-UI use case as a concise advanced explanation and protocol table, with public DecisionTransport and working HTTP decision-route links. Remove the long unchecked custom SSE parser/tutorial rather than suggesting a built-in AG-UI decision adapter exists. Preserve the existing Recipe B section anchor when practical. Explain server routing, browser transport and authorization separately.

## Recordings and verification

IDs: `agent-routing` and `agent-fallback`. Record actual checked React clients only after both framework clients pass, talking to the actual checked Express/router implementation with injected scripted decision envelopes. The first capture routes an order question, then a returns question. The second shows an uncertain result, expected provider failure fallback, an unexpected run failure, and a successful explicit retry. Keep it focused and readable; author short phase captions from observed timestamps. No provider credentials, live model, real order service or narration in the recorder; disclose the fixture responses and presentation CSS.

Reuse Vite/static-client, Playwright and ffmpeg patterns. Produce MP4/WebM, poster, VTT, walkthrough and useful result images; record native dimensions in the catalog. Capture full viewport screenshots only, crop afterward. Preserve masters/captures/reports in ignored `dist/docs-agent-decisions`. Support DOCS_SKIP_RECORDING and DOCS_DEMO_MODES with unknown-mode rejection. Verify input isolation, both server branches, clarification, invalid envelopes/low confidence/known and unexpected errors, abort-before-handler, client cancellation/recovery, latest run isolation, no automatic request on load, desktop/mobile layout and encoded playback.

Run www build/test/lint/typecheck/e2e sequentially with generated-output targets isolated. Prefer a single test worker on this host; don't raise timeouts. Stop the owned built-site preview before rebuilding. Review spec and quality, create/attach PR, merge exact green head, then verify deployment, both live recipes and media MIME types. Do not publish an SDK release or archive ignored media masters.
