# Recorded local-model recipe and Remote MCP retirement

Continue the established checked-example documentation approach, Brian's pre-2025 voice, and the user's instruction to continue local models and remove Remote MCP. SDK publishing stays separate. Existing typography/navigation grouping remain. Reuse this managed worktree, branch blove/docs-local-models from merged main b6a2b025. Preserve ignored captures and masters.

## Local workflow

Replace the dense native-browser itinerary sketch with a complete small task: extract a trip brief, destination and integer days (1–14), from “Three days in Lisbon.” React LocalModels and Angular LocalModels/app-local-models use ordinary useStructuredChat/structuredChatResource with experimental_chrome and a shared two-field Skillet schema. Application validation bounds destination length and day count. A settled successful fresh response is displayed as a readable typed preview; partial/invalid/failed/stopped/stale results are not ready. No Apply, persistence, tools, hosted fallback or backend endpoint is needed.

Prepare model is explicit and starts native availability/preparation from the user's action. Missing/unavailable APIs report actionable status. Existing available models require no preparation session. Downloadable/downloading models require explicit Prepare model before creation, display progress, and destroy any preparation session on completion/error/cancel, including late completion. Generate never silently downloads: its transport downloadRequired callback rejects and asks to prepare again. A generated run's sessions remain transport-owned. Stop preserves a stopped state and a later explicit action recovers. No mount request/model creation. No API key or new dependency. Use structural native API types in a small checked helper; no new browser typing package.

Keep clients idiomatic: pure React render/hooks, Angular standalone OnPush/signals/function APIs, all four busy phases, fresh UUID user-only messages per independent request, safe Angular error reads, plain text fields. Shared helper owns schema, bounded validation, availability/preparation/session cleanup and ready-result checks. Exports have TSDoc. Tests precede code; parent observes RED.

## Recordings and editorial

Primary ID local-models. Record actual Chrome inference through the checked React client only after both framework clients pass the same real inference task. Use existing dedicated /tmp/hashbrown-native-model-profile, Chrome normal feature defaults as conformance requires, no personal/open profile, no downloads by recorder. Availability must already be available; otherwise fail visibly. Full viewport screenshots, then ffmpeg crops; MP4/WebM/poster/result/VTT/transcript. Disclose browser/version, actual native inference, added presentation styles, no narration, output variability and no provider key. Keep raw/masters/static builds/reports in ignored dist/docs-local-models. Target www:docs-local-models-demo compiles the same ngc output; no concurrent recorders or Nx/generated-output operations.

Separately verify actual clients against deterministic LanguageModel shims for missing/unavailable, download progress/failure/cancel/late cleanup, malformed/invalid/failed/truncated output, generation cancellation and recovery. These checks establish UI/transport contracts, not native model quality or real Edge behavior. Record fixture recovery only if useful and clearly labeled; primary footage must be real inference. Native checks run locally, never CI. Verify desktop/mobile layout and encoded playback.

Rewrite both existing local-models pages with opening video and result image, complete setup/mount/proxy-free instructions, exact checked source in closed disclosures, visible actions/results/recovery. Preserve valuable advanced Chrome image/audio and application-owned WebLLM guidance, clearly separate capabilities and links to conformance evidence from tutorial instructions. Native tools remain unsupported. Explain browser-local vs localhost Ollama vs application-owned WebLLM; link platform/ollama rather than replacing this browser recipe with Ollama. Avoid broad latency/privacy/offline guarantees; model downloads and telemetry have separate network behavior. Check current Chrome/Edge primary docs. No new WebLLM dependency or model weights for this increment.

## Retire Remote MCP

Remove both recipe files and its navigation entry, search/LLM discovery and inventory pending work. Preserve old React/Angular HTML and .md URLs with permanent redirects to the corresponding tool/functions guide. Do not remove the core MCP runtime or unrelated SDK capabilities. Tests verify retirement and redirect targets; built/live checks verify redirect behavior.

## Delivery

Run www build/test/lint/typecheck/e2e sequentially, single test worker on this host. Stop owned built-site preview before rebuilding. Review code/spec and final prose, desktop/mobile built site and actual media. Continue standing PR/merge-on-green workflow; attach PR, verify exact green head and production/live assets/redirects. Preserve masters; no SDK release.
