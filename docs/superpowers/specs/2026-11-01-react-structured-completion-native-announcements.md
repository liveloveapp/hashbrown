# React Structured Completion Native Announcements

Status: independently reviewed and implemented. The browser-tool correction passed its initial five maintained regressions. The separate-server amendment then produced four meaningful failures in 13 focused tests before its narrow correction. All 13 focused tests, all 258 React tests in 22 files, build, lint (10 existing warnings, no errors), API report and four e2e tests pass. Fresh artifact/full-matrix qualification remains pending; no full-matrix result is claimed.

## Problem and decision

Actual attempt15 reached42 passing cases, then the first React structured-completion cold settlement consumed a genuine current success RUN_FINISHED and valid strict JSON answer while exposing output:"". The native canonical history begins with an assistant tool announcement carrying exact content:"" and nonempty browser tool calls. React useStructuredCompletionWithMessage selects the first assistant with defined non-null content, so it chooses that announcement instead of the later answer. The public structured output contract and current terminal oracle correctly require the parsed answer.

Match existing plain useCompletion semantics: keep find and first-answer order, add the existing nonempty-toolCalls exclusion to the structured helper candidate predicate. Preserve defined/non-null content checks so valid falsy schema values remain eligible. A tool announcement is not the completion answer, even when it has accompanying content. useUiCompletion shares this internal helper and must retain the final answer's canonical ID, raw structured data and trusted component rendering.

Do not switch to findLast, rewrite/drop canonical history, synthesize schema text, use generic truthiness, select preserve-diagnostics automatically, weaken terminal expectations or change native/Angular/Core behavior. Angular's existing last-message projection does not show this specific first-announcement shadowing defect; no speculative parity patch is included. Public signatures, exports, defaults, dependencies and all372 acceptance identities stay unchanged.

## Evidence boundaries

The actual cold trace3 current run ba75ec86-4613-4073-82c6-c0489f7f4fe6 exposes output:"", pending/pendingInterrupts null, required false, idle, error null, current typed text/terminal consumed and disposed. Two real provider requests carry the configured schema; native rejection witness and save-success2 are retained. The failure occurred before final PG snapshot collection, so these facts do not establish an independently recorded final Ready state. Retain the original failed packet and qualify the physical state on the next actual run.

The earlier warm-context trace extraction is separate from the current cold proof. Native empty tool content is valid canonical recovery data; it remains exactly unchanged by this selector correction.

## Test-first plan

Files: all tests, including the actual unmocked UI-hook integration, in packages/react/src/hooks/use-structured-completion.spec.tsx; the globally mocked use-ui-completion.spec.tsx remains unchanged; implementation only packages/react/src/hooks/use-structured-completion-with-message.ts after root RED authorization.

- [x] Add mounted real-runtime strict Completed restore with native empty tool announcement, exact stored tool result and later schema-valid answer. Input null/undefined must leave transport/handler calls0. Check public output, internal message canonical ID and unchanged snapshot content/IDs/args.
- [x] Add strict Pending restore followed by explicit complete resumeConversationRecovery through actual public hook. Emit genuine-shaped typed continuation text/terminal through the existing unit Transport seam; verify one continuation, exact retained canonical prefix, browser result and protected decision if mixed, no handler replay, actual answer output/ID.
- [x] Add public useUiCompletion restore with trusted exposed component. Require actual rawOutput, assistant ID/content and rendered component to correspond to the answer rather than the empty tool shell; transport/handler calls0. Avoid fabricated helper output; any test mock boundary must delegate transparently to the actual helper, or place the test in an existing unmocked spec.
- [x] Add controls for first legitimate non-tool answer (not later answer), tool announcement with content and a legitimate empty-string schema value. Do not change first-answer or falsy-value behavior.
- [x] Root runs focused hook tests and records meaningful selector RED separately from type/fixture setup failures. No implementation before release.
- [x] Apply only the nonempty-toolCalls candidate exclusion after reviewed RED. Root runs focused GREEN, all five affected React gates (build/test/lint/API/e2e), independent SPEC/QUALITY rereviews and source binding checks. No other package source patch is anticipated.
- [ ] Root preserves the prior bounded 12-stage Pydantic qualification (none of its 44 selected source inputs changed in this selector slice), refreshes both source-candidate artifacts and all20 isolation controls, then actual exact all372. All rows remain required; earlier partial runs remain failures. No publication is authorized by this correction.


## Separate native server-announcement amendment

Responses can publish browser and protected calls in distinct assistant parents. Core keeps unregistered native/server calls in existing display-only serverToolCalls, leaving regular toolCalls empty on a protected-only parent. The narrow repaired boundary is EXACT empty content plus a serverToolCalls entry whose kind is not provider: skip only content === '' && serverToolCalls.some(call => call.kind !== 'provider'). Keep the existing registered-browser toolCalls exclusion unchanged, first eligible ordering, defined/non-null content checks and legitimate no-server empty-string answers.

Actual attempt16 consumed valid schema JSON/current success but exposed output:"" from an empty protected-only parent. Canonical split-parent Completed, Pending explicit browser-null/protected-decline continuation and trusted UI restore regressions must derive serverToolCalls from real Core calls/results, never fabricated public messages. Keep stable fixture transports/tools/schemas. Wire/IDs/arguments/history, Core/Angular/public signatures and all372 cases remain unchanged. Verification and fresh qualification remain required.

## Provider and nonempty server-associated answer preservation

Provider builtin events and ordinary function events can share the actual assistant ID with a genuine parsed final answer. Do not blanket-exclude serverToolCalls, even for a non-provider or unclassified entry. ALL nonempty parsed server-associated answers remain eligible under existing first-answer behavior. Existing b4.step v1 kind:provider/builtin:web_search metadata is optional display data; an absent public kind is not a reason to discard nonempty answer content. This amendment is a narrow empty-announcement view boundary, not a promise of universal server/provider classification or a new metadata API.

Real mounted typed-event controls preserve a nonempty structured/UI answer on its same provider-associated ID, including true statusless b4.step metadata {v:1,kind:provider,builtin:web_search} and entirely absent normalized metadata; structured controls assert actual Core-derived serverToolCall.kind is absent and true statusless raw metadata remains intact. Mixed provider/native nonempty answer content stays eligible before later answers, while an exact-empty mixed announcement yields to the later actual answer. Known provider-only attached content remains supported. Existing split-native, first-answer, nested falsy and legitimate no-server root-empty-string controls remain required. No production predicate change precedes revised focused RED and SPEC/QUALITY approval.
