# Complete the documentation learning paths

The user approved all four follow-ups in order: streaming JSON parser, generative UI chatbot, learning-path audit, then API overview/platform guidance. Writing follows Brian Love's 2024 and older posts: teach through a small task, explain concrete code after showing the result, use short paragraphs and direct next steps. SDK releases remain separate.

## 1. Streaming JSON parser

Keep the weather-preview task, using a finite local JSON stream rather than pretending to call a weather API or model. Both frameworks use the real public parser API and the same Skillet schema. Show accumulated JSON beside a preview: a normal string waits for its closing quote, a streaming string grows, and an array exposes complete objects. Explicit Start, Stop, Reset and recovery establish stream ownership. Check completion, invalid JSON/schema, truncation, replacement and cancellation; partial values never imply a completed valid document. At EOF, validate JSON.parse(accumulatedJson) with the complete schema; a cached hook value or AST match can retain/default missing streaming properties. Cover a syntactically complete document with missing fields and wrong field types. Keep complete source in closed disclosures. Register separate json-parser-react/angular media IDs and a serial Nx target. Record the real clients using ffmpeg, with clear fixture disclosure, measured captions, screenshot, poster and transcript.

## 2. Generative UI chatbot

Replace the oversized smart-home walkthrough with a small simulated light conversation. A browser tool reads application-owned lights; the model selects a trusted light component and validated proposal props; a user-operated Apply button changes local application state. A follow-up reads the updated state. The recording fixture must exercise actual browser tool continuation: tool-call AG-UI events, the real handler result in the next request, then trusted UI JSON; assert the captured tool result and updated follow-up state. Unknown IDs, invalid brightness, failed/truncated/cancelled runs and stale proposals must not change the lights. Apply is authorized by application context, never model props: successful completed current run, current light revision and unused proposal. Cover streaming-time Apply, repeated Apply, a newer request, cancellation and late responses. Preserve plain user messages and explicit Send/Stop/retry. Use actual Hashbrown UI rendering/tool handlers, with deterministic output at the documented transport/provider fixture boundary; disclose that no real device or live model is used. Verify Angular and React and record actual framework footage under separate ui-chatbot-react/angular IDs with an explicit Nx target. Source disclosure guards compare checked files exactly; all raw captures and masters use unique ignored directories.

## 3. Audit both learning paths

Walk each framework from introduction and Quickstart through fundamentals, typed output/UI/tools, then persistence, endpoint policy and production. Fix actual prerequisite/version/API/link inconsistencies and repetition; retain stable routes and avoid broad prose churn. Record findings and resolutions in an audit artifact. Do not add a second navigation redesign without evidence it improves the existing structure.

## 4. Overview and platforms

Keep API selection and platform comparison pages short and decision-oriented. Explain result shape, single input versus conversation, runtime ownership, server/provider setup, decisions and browser-local models. Ground capability claims in current source and checked examples; avoid unqualified "no limitations" claims. Use existing relevant demos only when they explain a specific choice. Otherwise mark these pages as intentional media exceptions and link to runnable guides.

## Verification and delivery

No new repository dependencies or SDK changes are planned. Tests use top-level test with arrange/act/assert. Parent serializes all Nx/build/generated-output/recording work; focused agents can independently implement one approved stage or review source. Both clients must pass behavior checks before recording. Preserve masters under unique ignored dist directories. Run affected www build/test/lint/typecheck/route report, inspect built desktop/mobile pages, disclosures, scrolling, Migrations last/collapsed and all media. Create and attach a PR, merge the exact green head, verify production and canonical live pages. No package publishing or tags.
