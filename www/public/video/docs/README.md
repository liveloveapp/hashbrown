# Documentation demo media

The original six recordings show the real ATC example using scripted model responses and fixture traffic. They have no narration or soundtrack. The recordings identify the scripted data in their footer; the documentation figure and text walkthrough repeat it.

Each topic has an H.264 MP4, VP9 WebM, PNG poster, WebVTT descriptions, and plain-text walkthrough. Generative UI and decisions also have result screenshots. The same behavior recordings are shared by the React and Angular guides.

| Recording     | Documentation page |
| ------------- | ------------------ |
| generative-ui | concept/components |
| streaming     | concept/streaming  |
| browser-tools | concept/functions  |
| schemas       | concept/schema     |
| decisions     | concept/decisions  |
| debugging     | concept/debugging  |

Source footage comes from `examples/atc/e2e/demo/record.ts`, recorded with `npx nx demo atc-e2e -- --demo-only`. ffmpeg trims and combines the corresponding named scenes with chapter graphics and exports the web formats. Master footage, edit script, scene manifest, and review contact sheets are in the local `dist/docs-media/` production output. The recording reflects the ATC source at commit `52db6954`; refresh footage when those examples materially change.

The debugging recording was captured separately from the same ATC app using its keyboard-accessible developer drawer, Router, UI stream, and Tools tabs. Its local production scripts and footage are in `dist/docs-media/record-debugging.ts` and `dist/docs-media/debugging-work/`, with ffmpeg edits in `dist/docs-media/debugging-production/`. It demonstrates the example app’s inspector; the separate Redux DevTools instructions are in each Debugging guide.

## First-component and conversation recordings

`welcome-card` and `conversation` use the exact client source in `www/examples/quickstart`, verified in React and Angular. The recorder streams deterministic AG-UI output into the actual clients; it does not use a provider key. Added presentation CSS is disclosed in the guide/player. Source recorder: `www/src/tools/record-docs-quickstart.ts`; run `npx nx docs-demo www`. Captures/masters and verification results remain in ignored `dist/docs-quickstart`. The conversation recording demonstrates context within one instance, not persisted history after a refresh.

## Typed drafts and progressive items

`structured-form` and `streaming-data` record the checked shopping-list clients. Source: `www/src/tools/record-docs-structured.ts`; run `npx nx docs-structured-demo www`. Both React and Angular are verified; React supplies the shared recording. Scripted AG-UI output, added presentation CSS, no narration, live model, purchase or server write. Generate → review → Apply is explicit. The applied list is component-local state. Complete capture masters and adverse-ending verification remain in ignored `dist/docs-structured`. See `docs/docs-media-inventory.md` for current page coverage and remaining work.

## Magic Text, suggestions and view selection

`magic-text`, `predictive-suggestions` and `ui-selection` use the checked framework clients in `www/examples/quickstart`. Source: `www/src/tools/record-docs-recipes.ts`; run `npx nx docs-recipes-demo www` sequentially with other recorders. Both frameworks are verified before React supplies the shared captures. Text/completion output uses scripted AG-UI responses; view selection uses scripted decision responses. Presentation CSS is added. No narration, live model call or server write is shown.

The interactions are streaming Markdown with citation details, explicit Accept/Dismiss of a context-bound packing proposal, and summary/list selection with app-owned data. Each includes MP4/WebM, a poster, captions, a walkthrough and result screenshot. Captures, masters, static builds and the browser verification report remain in ignored `dist/docs-recipes`. Use `DOCS_SKIP_RECORDING=1` to check behavior without replacing media, and `DOCS_DEMO_MODES` to select these target-specific IDs.
