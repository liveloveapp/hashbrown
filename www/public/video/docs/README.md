# Documentation demo media

These six recordings show the real ATC example using scripted model responses and fixture traffic. They have no narration or soundtrack. The recordings identify the scripted data in their footer; the documentation figure and text walkthrough repeat it.

Each topic has an H.264 MP4, VP9 WebM, PNG poster, WebVTT descriptions, and plain-text walkthrough. Generative UI and decisions also have result screenshots. The same behavior recordings are shared by the React and Angular guides.

| Recording | Documentation page |
| --- | --- |
| generative-ui | concept/components |
| streaming | concept/streaming |
| browser-tools | concept/functions |
| schemas | concept/schema |
| decisions | concept/decisions |
| debugging | start/quick (debugging section) |

Source footage comes from `examples/atc/e2e/demo/record.ts`, recorded with `npx nx demo atc-e2e -- --demo-only`. ffmpeg trims and combines the corresponding named scenes with chapter graphics and exports the web formats. Master footage, edit script, scene manifest, and review contact sheets are in the local `dist/docs-media/` production output. The recording reflects the ATC source at commit `52db6954`; refresh footage when those examples materially change.

The debugging recording was captured separately from the same ATC app using its keyboard-accessible developer drawer, Router, UI stream, and Tools tabs. Its local production scripts and footage are in `dist/docs-media/record-debugging.ts` and `dist/docs-media/debugging-work/`, with ffmpeg edits in `dist/docs-media/debugging-production/`. It demonstrates the example app’s inspector; the separate Redux DevTools instructions remain in each Quickstart.
