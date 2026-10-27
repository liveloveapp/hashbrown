# Canonical authoring implementation plan

> Use superpowers:subagent-driven-development for implementation and independent reviews.

**Goal:** Add Decisions in Agents, streaming JSON parser and natural forms to the canonical Angular/React workbench and publish six recorded guides.
**Architecture:** Shared immutable authoring observation/controller + guarded application Apply; actual text chat and direct parser APIs in both clients; server-owned TypeSafe routing and OpenAI schema policy; existing capture shell/replay preserved.
**Tech Stack:** Hashbrown, TypeScript, Skillet, Angular/React, Express, Vitest, Playwright, ffmpeg, Next.js.

- [ ] Shared contract/server: write failing tests for source/parse/final validity, form validation/origins/once-only Apply, agent confidence/known handlers/abort/fallback, then implement runtime helpers/store extension/catalog and server routing wrapper. Preserve old paths. Focused tests.
- [ ] Framework clients: tests first; actual useChat/chatResource plus useJsonParser/jsonParser for raw JSON; forms readContext tool; shared labelled controls and actual captured historical rendering, teardown and stale guards. Root dispatch. Focused tests and strict workbench build.
- [ ] Verification/recording: fixtures at actual provider-native boundary, browser flows and negative cases, TypeSafe genuine publication gates, measured captions and six stable IDs. Tests first for pure cue/fixture helpers. Full selected browser checks before paid recording.
- [ ] Guides/media: read older author prose, rewrite six recipes with canonical source links, update catalog counts/media inventory/registry. Record six actual provider flows. Decode codecs, check captions/images, native local production playback and served hashes.
- [ ] Complete: independent spec/quality/final reviews, www test/build/lint, strict build, 48-path browser suite, route report; commit/push/create and attach PR, merge on green, verify exact production deployment plus six videos/36 assets. No SDK release.
