# Preserve causal evidence for owned downstream disposal

Status: Implemented and reviewed. Tests-first controls, all affected local checks, 48 ordinary browser fault cases and one controlled actual .NET/browser causal case passed. A fresh complete CI run remains required; the retained C5 cold failure stays FAILED.

## Actual failure and causal boundary

[CI 41596618706](https://github.com/liveloveapp/hashbrown/actions/runs/41596618706), at [9fabd7f28f10637582a8c73e9520ef555b4405dd](https://github.com/liveloveapp/hashbrown/commit/9fabd7f28f10637582a8c73e9520ef555b4405dd), failed cold recovery at 67 passed / one failed / 304 not run in react.openai.responses.chat.failure.malformed-ack.

Actual proxy ordering was ACK-write 39 → genuine mutation 41 → corrupt delivery 42 → later source 43 → actual downstream-close 44 → fault 45 with raw reason “Downstream closed”. Source 1369/delivered 845 bytes differed at the one intended JSON opening-brace corruption in the delivered prefix. There were no bytes after close and no HTTP complete. The actual SDK consumed its current ACK, then reported SyntaxError, recovery required and current error/disposal.

The proxy awaits actual source evidence persistence before delivery. A client close during that await reaches its local prewrite destroyed guard. A second proven window exists across await sendHeaders: the response can close while delivered-header persistence is pending, before the current code installs write listeners. These are test-infrastructure causal-representation/delivery-window defects, not native/Core/React/Angular product authority changes.

## Narrow approved representation

Only the owned request-local before-write observation may create a private branded disposal value, identified by owned object identity. It must join the actual unique committed same-request downstream-closed receipt and preserve the raw reason. The optional fault fields are exactly:

- faultCause: downstream-closed;
- faultStage: before-write;
- downstreamCloseSeq: the actual committed close sequence.

Apply the same narrow prewrite observation before delivery and after the awaited sendHeaders boundary. Do not brand by message string, eventual response.destroyed, a global catch, ordinary callback Error identity or parent cleanup. Existing native Node aborted handling stays strict. The consumer still requires genuine ACK/corruption/source-prefix, exact request scope, current parser/recovery/lifecycle, close-before-fault and no-late-bytes proof; the separate complete-entity branch remains intact.

Write/backpressure causal stages are explicitly UNIMPLEMENTED and deferred until a real pending operation and its exact causal winner are proven. Existing write/error/backpressure behavior remains unchanged and fail-closed; no Promise.all refactor is included. Evidence append/upstream/limit/deadline/genuine callback errors are never normalized. No product API, source result, browser handler, no-replay bound or native authority changes.

Rejected alternatives: raw reason allowlists mask unrelated faults; classifying a later-destroyed response misattributes cleanup; sleeps/retries hide ordering. Old C5 receipts must never be rewritten with new causal fields or relabeled as passing.

## Actual test-first evidence

The first maintained prewrite test persisted and then paused only a genuine later upstream-body append resolution. A real client consumed ACK and the proxy's actual malformed frame, producing a real JSON SyntaxError. It then destroyed the real client, awaited actual owned ServerResponse.close and released the append. Root witnessed all parser/byte/order/cardinality/cleanup guards pass; only the three new causal fields were missing.

The header-await test pauses resolution only after actual delivered-headers persistence, destroys the outgoing client before any response/body is received, awaits real ServerResponse.close, then releases. Root witnessed the old implementation append a delivered-body receipt AFTER real close. It therefore proves the required post-header prewrite recheck as well as the missing typed evidence. One real request, original source bytes and owned drain are retained.

The transparent callback-error control forwards actual response.write bytes, then injects a distinct ordinary Error(“Downstream closed”) into only the completed write callback while the response is undestroyed. Root observed fault before the subsequent actual close and no typed marker. This control PASSED unchanged code; it must remain passing. The injected callback fault is explicitly a controlled test fault, not a naturally occurring network failure.

The attempted strengthening of the existing 16MB backpressure test failed because observing its FIRST backpressure receipt does not prove a write/drain is still pending when the client later closes. That was an invalid stage-coverage assumption, not a new demonstrated proxy defect. Its original cleanup/no-retry assertions are restored. It does not establish typed write/backpressure coverage.

Root's combined run recorded four failures/one pass, including separate consumer-data assertions; only the supported producer scope above is approved for future implementation. The new positive causal paths were verified RED against unchanged C5 producer code and GREEN after implementation. Ordinary callback-error and shutdown exclusion controls passed both implementations. The record-limit regression also proves failed close evidence remains a fatal cleanup failure.

## Parent-shutdown negative boundary

Parent shutdown must not become expected client-disposal evidence. The exact held-append ordering needs care: close() awaits queued stop-start persistence BEFORE socket destruction, so a held append prevents parent-only ServerResponse.close before barrier release. A test must not synthesize that event or claim an impossible order.

A practical same-fixture control can start real parent shutdown first, then explicitly destroy the real client to release the physical close while closing is active; it must be labeled a mixed parent-shutdown/client-close control and remain untyped. This approved variant is now authored as “candidate proxy does not brand disposal after shutdown has begun”, reusing the same TSDoc-documented real prewrite race fixture. It starts proxy.close first, then explicitly destroys the client, awaits the real close, releases the append and awaits the existing stop promise rather than calling a wait API after closing. It requires actual global stop-start.seq < actual downstream-closed.seq < fault.seq, preserved raw reason and no typed fields. It does not prove parent-only physical close causation.

## Remaining qualification

The maintained primitive regression tests use actual owned Node HTTP primitives; they are not a qualified .NET/browser matrix. Deferred barriers and owned resources must always release/drain with primary failures preserved. Root owns focused RED/GREEN, source reviews, fresh candidates and full qualification. C5 source-browser and package ABI domains remain separate; package-profile ABI proof cannot be assigned to the different cold loaded DLL.

## Reviewed implementation and verification

The implementation uses request-local owned Error identities and an actual committed close receipt. It checks destruction both before delivery and after awaited header evidence persistence. Failed close-evidence tasks remain visible to owned cleanup. The strict consumer validates the three typed fields, original request scope, unique referenced close and close-before-fault ordering. Ordinary same-text errors, shutdown, unsupported stages and incomplete evidence remain rejected.

Root ran affected build, test and lint successfully: 238 harness tests, 385 runtime tests and 122 package tests. Seven selected maintained causal/negative controls passed; the positive paths had intended tests-first failures, while callback-error and shutdown exclusions remained passing controls. An additional real record-limit control failed against C5 and passed against the implementation.

All 48 unmodified focused browser fault cases passed once, with zero retries; their malformed cases naturally exercised Node's existing aborted path. A separate one-case actual React/OpenAI Responses/.NET browser probe deterministically delayed only real read/append promise delivery. The actual SDK consumed corrupt bytes, raised its parser error and closed its real response before the genuine later source append resumed. The producer emitted raw Downstream closed with before-write metadata referring to the actual committed close. The unchanged original journey passed its native cleanup, no-work, reconciliation and teardown guards; no client abort was forced. Both candidate package qualifications passed afterward. This controlled case establishes the added causal path; it is not full 372-case acceptance.

The previous C5 source-browser and package domains remain separately recorded. Physical ABI checks used the actual archived CI package DLL, whose hash differs from the cold browser DLL; those binary results are not interchangeable. A new complete current-head workflow, including the full source and cold matrices, is required before integration.
