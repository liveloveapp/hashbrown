# Recorded media comprehension audit

Reviewed 2026-10-30. Scope: the 29 canonical lessons in Angular and React, or 58 distinct recording bundles. The filesystem contains 60 capture stems because the two Generative UI recordings also have overview aliases. Those aliases are the same recordings, not additional lessons. The active accessibility test also covers the two earlier Threadplane recordings.

## What was reviewed

For every distinct bundle, I read the capture metadata, event shapes, caption cues and transcript; compared the Angular and React explanations; and probed both MP4 and WebM with `ffprobe`. All 58 pairs are 1600 × 1000, with matching dimensions and duration differences below 150 ms. All capture sequence numbers are contiguous. Source metadata distinguishes hosted providers, native Chrome inference and QuickJS execution. Debugging records the deliberate local denial separately from provider output.

I extracted 116 representative video frames with `ffmpeg`: two timestamps in each SDK recording for each lesson. The table below records the exact encoded-video seconds inspected. The first sample is 0.2 seconds after the first caption interval; the second is 0.5 seconds into replay. In longer lessons, the first interval can be preparation, an error, storage or an approval pause rather than generation completion. Replay begins at the original captured request, so an empty JSON/props panel at the second sample is expected. It is not a failed recording.

I also extracted 24 detail frames across Tools, Natural language forms, Production recovery, Local models, UI kits and UI chatbot: the midpoint of the third caption interval and 0.5 seconds before the end, in both SDKs. These additional samples check acceptance, follow-up context and final application state. Contact sheets were inspected locally in `/tmp/hashbrown-media-review/`; they are review working files, not published assets. This is a frame-and-evidence review, not a claim that every frame was watched continuously.

The review follows the practical, direct explanation style of Brian Love’s older writing, including `~/repos/brianflove/src/content/posts/2024-01-11-success-in-the-ordinary.md`: explain the visible action, then its consequence. The workbench’s existing LLA layout and styling remain intact.

## Findings and changes

The existing 20-character-per-second caption limit allowed several captions to compete with the inspector for attention. Seven cues in the 58 canonical bundles exceeded a stricter 17-character-per-second reading budget:

| Caption                                      | Original rate         | Change                                                    |
| -------------------------------------------- | --------------------- | --------------------------------------------------------- |
| Decisions, React: next choice                | 18.44 chars/s         | “Next choice: review.”                                    |
| Prose, Angular / React: citation        | 19.48 / 19.84 chars/s | “Open citation. A reference is not verification.”         |
| Prose, Angular / React: replay          | 17.21 / 17.53 chars/s | “Replay shows Markdown and state. No requests or writes.” |
| System instructions, Angular / React: replay | 19.21 / 19.13 chars/s | “Replay shows captured policy. No new requests.”          |

The active accessibility regression also exposed a dense cue in each earlier Threadplane recording (18.21 / 18.21 chars/s). It now says “First turn retained in local history.” Decisions uses the same shorter wording in both SDKs even though Angular’s original cue was within budget. The generators, published VTT files and plain-text transcripts were updated together. Caption timestamps, recorded events, posters, result images and encoded videos were preserved. No output was fabricated and no capture provenance was restamped.

The shared publication validator and active-media accessibility test now enforce 17 characters per second. A failing unit test reproduces a caption that passed the former 20-character limit but leaves too little attention for the UI. The regression run first failed on that validator and the dense published captions. After correction, all 378 cues in the 58 distinct bundles are present verbatim in their companion transcripts; the maximum reading rate is 16.559 characters per second. This is a local review budget, not a claim of compliance with a universal caption standard.

## What the recordings teach

- First plan shows the trusted SummaryCard preview while application revision stays zero. Conversation retains local messages across distinct runs. System instructions shows browser policy being replaced by server policy; it does not imply that prompts authorize actions.
- Generative UI and Tools separate model output, resolved props and explicit acceptance. In Tools React, `readContext` returns revision zero at capture elapsed 1838 ms, the first generation completes at 4148 ms, and acceptance advances revision at 5412 ms. The next user prompt appears at 6424 ms; `readContext` then reads revision one at 8167 ms before completion at 10249 ms. Angular follows the same request/tool/continuation/acceptance order. Each SDK has four transport requests and two browser tool results across the two turns. These are continuation requests, not four independent user turns.
- Structured output, Streaming and Schemas render typed data through application code. Generative UI renders exposed trusted components. The similar plan card is a useful common example, but the caption/transcript distinction is necessary to avoid treating these APIs as interchangeable.
- Decisions and UI selection show whole TypeSafe results and confidence, rather than invented token streaming. The selected IDs are application-owned. UI selection ends with an explicit manual steps choice at revision two. Agent decisions retains the real low-confidence outcomes: Angular 0.72 and React 0.74 route to clarification, followed by 0.92 and 0.94 for the record route. The handler’s response is application text, not model prose.
- Shared state, Activities and Interrupts distinguish the local AG-UI agent’s protocol events from the hosted provider’s unchanged text. The application plan remains at revision zero. The complete approval batch resumes the same turn; the next turn has a new batch. Approval permits another explanation, not execution of plan steps.
- Message history and Save text conversations distinguish SDK message identity from application-owned copies. The latter deliberately reloads the page, so its capture contains only post-reload events. The footage’s earlier visible steps are not expected to appear in that final capture. Browser documents are explicitly labelled origin-local and unencrypted.
- Server threads and Public endpoints show real HTTP storage/access operations alongside SDK text. The captured repository is process memory, not durable checkpoint recovery. Anonymous and foreign-owner denial precede provider work. The server-thread story includes a real competing-client write and a stale 409, rather than a staged success message.
- Production recovery is a different integration: the real b4.run/Postgres/OpenAI path. Its final persisted revision is in the `production` event payload, not the unrelated top-level application-plan field. In React the final production observation at elapsed 5067 ms has application revision one. Reading only the top-level revision zero would incorrectly contradict the caption. The post-refresh timeline records newly observed restore/resume facts; the transcript explicitly says it does not reconstruct the original stream timing.
- Local models is labelled native Chrome inference, with explicit preparation and acceptance. It runs at actual speed, unlike the half-speed hosted recordings. The transcripts distinguish the existing dedicated test profile from general device availability, and separate labelled API fixtures from inference footage.
- JavaScript runtime contains real QuickJS results, host-call wrappers and errors. It makes zero model requests in either SDK. The estimate changes while the plan stays unchanged; the transcript preserves the deadline, host effects and memory-limit caveats.
- JSON parser separates source completion, parser completion and original-document validation. Natural language forms adds editable reviewed fields and explicit Apply. Both SDK recordings retain the real model’s rewritten first step and the user’s correction before the second apply. The final accepted revision is two; the recordings do not pretend that generation itself applied either plan.
- Prose retains the reference-versus-verification distinction. Predictions separates dismissing a completed proposal from accepting a fresh one. UI kits shows two explicit acceptances and two trusted components; UI chatbot shows a read-only PlanReading after acceptance. Request transformation shows the actual adapter callback trace and preserved mapped fields. Debugging visibly labels its initial 403 as a local demo switch, then retries in the same SDK conversation.

Angular and React have the same lesson-level actions, request/tool counts and state outcomes. Their real prose, token timing and confidence differ. Transcript text is identical after the SDK heading except for the actual Agent decisions confidence scores; no attempt was made to manufacture identical model responses.

## Coverage and inspected video timestamps

Times below are encoded-video seconds, not `elapsedMs` from capture events. Hosted footage is slowed to half speed and includes reading pauses. Capture event time can restart at a new run; event sequence and turn identity are authoritative. Do not infer a global video timestamp by blindly doubling every capture event’s elapsed value.

“Requests/tools” counts the published capture’s browser transport events per SDK; post-refresh captures intentionally omit prior-page operations. Production server tool execution is recorded in its protocol/production observations rather than as a browser `tool` event.

| Lesson                  | Angular duration; inspected frames | React duration; inspected frames | Requests/tools, each SDK |
| ----------------------- | ---------------------------------- | -------------------------------- | ------------------------ |
| activities              | 28.000s; 10.066, 17.532            | 26.400s; 8.494, 16.818           | 2 / 0                    |
| agent-decisions         | 44.467s; 10.502, 24.804            | 44.067s; 10.270, 24.604          | 2 / 0                    |
| conversation            | 20.600s; 5.820, 13.158             | 20.567s; 5.340, 12.684           | 2 / 0                    |
| debugging               | 35.800s; 4.966, 25.470             | 35.400s; 4.708, 25.142           | 5 / 2                    |
| decisions               | 16.167s; 2.744, 8.562              | 15.766s; 2.618, 8.152            | 2 / 0                    |
| first-plan              | 15.767s; 5.912, 8.036              | 15.900s; 5.996, 8.082            | 1 / 0                    |
| generative-ui           | 30.867s; 9.856, 22.004             | 29.500s; 8.912, 20.542           | 4 / 2                    |
| interrupts              | 34.467s; 8.300, 24.756             | 35.766s; 9.308, 25.856           | 3 / 0                    |
| javascript-runtime      | 40.467s; 9.170, 30.496             | 40.300s; 8.926, 30.296           | 0 / 0                    |
| json-parser             | 54.600s; 11.612, 27.970            | 56.400s; 12.374, 28.734          | 2 / 0                    |
| local-models            | 30.367s; 2.578, 25.855             | 35.033s; 4.490, 30.268           | 2 / 0                    |
| prose              | 27.667s; 8.668, 20.132             | 26.200s; 8.384, 18.798           | 4 / 2                    |
| message-history         | 57.767s; 8.190, 32.256             | 55.400s; 7.970, 31.114           | 2 / 0                    |
| natural-forms           | 83.400s; 13.568, 57.738            | 82.300s; 13.406, 56.502          | 4 / 2                    |
| predictions             | 27.000s; 6.098, 20.528             | 25.800s; 7.110, 20.988           | 3 / 0                    |
| production-recovery     | 32.267s; 6.110, 23.722             | 33.133s; 7.111, 24.506           | 1 / 0                    |
| public-endpoint         | 51.367s; 8.132, 33.136             | 50.700s; 7.938, 32.408           | 1 / 0                    |
| request-transformation  | 30.967s; 7.856, 20.526             | 32.567s; 8.472, 22.166           | 4 / 2                    |
| save-text-conversations | 71.000s; 13.946, 49.306            | 63.000s; 13.746, 47.938          | 1 / 0                    |
| schemas                 | 30.067s; 8.904, 21.152             | 29.800s; 8.604, 20.812           | 4 / 2                    |
| server-threads          | 79.767s; 8.182, 54.420             | 82.467s; 7.904, 56.064           | 1 / 0                    |
| shared-state            | 24.200s; 2.800, 15.822             | 24.867s; 2.374, 16.326           | 2 / 0                    |
| streaming               | 30.300s; 8.834, 21.380             | 30.700s; 9.612, 21.792           | 4 / 2                    |
| structured-output       | 36.567s; 14.844, 28.000            | 31.600s; 10.572, 22.714          | 4 / 2                    |
| system-instructions     | 27.600s; 7.046, 19.670             | 21.400s; 6.668, 13.420           | 2 / 0                    |
| tools                   | 32.200s; 9.900, 23.028             | 35.000s; 11.216, 26.004          | 4 / 2                    |
| ui-chatbot              | 56.600s; 16.002, 40.730            | 56.400s; 15.770, 40.566          | 4 / 2                    |
| ui-kits                 | 60.200s; 15.974, 44.180            | 62.000s; 16.852, 46.040          | 4 / 2                    |
| ui-selection            | 15.767s; 3.262, 10.676             | 15.100s; 2.826, 10.090           | 2 / 0                    |

The six additional detail sheets use these rules against the published VTT: third-cue midpoint and `ffprobe duration - 0.5`. To reproduce an individual frame:

```sh
ffmpeg -v error -ss 11.216 \
  -i www/public/video/docs/canonical-workbench-tools-react.mp4 \
  -frames:v 1 /tmp/tools-react-11.216.png
```

## Verification and limits

The focused recording/media run passed **13 files and 179 tests**:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true \
  npx nx test www --excludeTaskDependencies --output-style=static \
  --args='recording canonical-media-accessibility parser-captions recipe-media --maxWorkers=2'
```

Independent media checks covered all 58 MP4/WebM pairs, 378 cue intervals, transcript/caption consistency and contiguous event sequence numbers. Prettier was run on the changed recorder/test files. Existing tooling warnings concern `NO_COLOR`/`FORCE_COLOR`, Nx’s deprecated Vite paths plugin and CommonJS Vite config loading. Aggregate site build/lint and broader checks belong to the coordinating verification pass.

The 1600 × 1000 footage retains the full inspector and sidebar. Inspector payload text is too small for a reader to study comfortably in a narrow inline player; pause/fullscreen, the transcript and the interactive inspector remain necessary. Shortening captions frees attention, but does not increase the encoded text size. No broad zoom/crop or reshoot was attempted because it could hide the acceptance boundary, request list or provenance labels and requires new verified live footage. Representative frames do not prove every transition is optimally paced, and native caption overlay rendering was not re-tested in a browser during this pass. There is no narration; the transcript is descriptive and is not an audio transcript.
