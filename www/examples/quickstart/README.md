# Documentation examples

These are the complete files used in the React and Angular Quickstarts, Messages and turns, Message history, and workflow guides. Guide tests compare the published code blocks with these files. `npx nx typecheck www` checks React/server types and Angular strict templates against the built packages.

The server is a local-development example, not a deployed public endpoint. Provider credentials stay in its `.env` file. The frontend configuration demonstrates a same-origin proxy.

The recorders use the checked client files with scripted AG-UI output. They verify both frameworks, then record the shared visible behavior from React. Their frame and presentation styles are added by the recorders; tutorial components have no stylesheet requirement. Neither recorder needs a provider key.

## Check and record

Run through Nx:

```sh
npx nx typecheck www
npx nx docs-demo www
npx nx docs-workflows-demo www
```

Run these sequentially. Both recording targets use `dist/docs-quickstart/compiled`, so concurrent runs can overwrite the compiled entry points. Recording requires installed Playwright Chromium, ffmpeg, and ffprobe.

`docs-demo` covers the welcome card and text conversation. Its captures, masters, browser build, and verification reports go to ignored `dist/docs-quickstart`.

`docs-workflows-demo` covers five modes:

| Mode           | Checked interaction                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `persistence`  | Save completed text, refresh without starting a run, switch between two conversations, and send restored history in a follow-up. |
| `interrupts`   | Display two approval questions and submit the complete batch before showing the resumed result.                                  |
| `shared-state` | Edit a destination, inspect it in the run input, and render the agent's state update.                                            |
| `activities`   | Show itinerary progress from zero through completion.                                                                            |
| `ui-kits`      | Generate a welcome card and a status card from one reusable component kit.                                                       |

The workflow recorder builds static clients and writes captures, masters, browser assets, and `verification.json` to ignored `dist/docs-workflows`. Final MP4/WebM files, posters, and result screenshots go to `www/public/video/docs`. Captions and text walkthroughs are maintained beside the published videos; review them whenever the interaction changes.

To verify browser interactions without recording or replacing published media:

```sh
DOCS_SKIP_RECORDING=1 npx nx docs-workflows-demo www
```

To select modes, use a comma-separated list without spaces:

```sh
DOCS_DEMO_MODES=persistence,interrupts npx nx docs-workflows-demo www
```

The supported names are the five modes above. Unknown names fail immediately. `DOCS_SKIP_RECORDING` and `DOCS_DEMO_MODES` can be combined.

## Check failure behavior

Alongside the selected interactions, the workflow recorder checks malformed saved-history preservation, disabled sending until explicit clearing, and storage quota failure for both SDKs. These storage checks run even when `persistence` is omitted from `DOCS_DEMO_MODES`. When `shared-state` is selected, it also injects `RUN_ERROR` after a state snapshot and confirms rollback to the committed destination and status. Unexpected page errors fail the main interaction checks. Read the final verification report before publishing the media.

The text-history unit tests cover the versioned storage format, validation, immutable serialization, and storage failures. The example stores only supported completed text conversations. It does not persist the canonical AG-UI checkpoint, generated UI, tool history, shared state, or pending interrupts. Reusing a thread ID after refreshing does not restore an interrupted workflow. The two browser conversation selections demonstrate the Message history guide's storage contract; the separate Threads recipe still needs its own recording.
