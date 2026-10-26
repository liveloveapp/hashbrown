# Local Chrome model qualification implementation plan

> For agentic workers: use superpowers:executing-plans for this bounded harness change.

**Goal:** Make local Chrome model experiments explicit without claiming SDK model selection.

**Architecture:** A pure helper owns the allowlist, browser flags, and model-version
selection; local Playwright configurations supply environment values and expose
selection in metadata. Existing inference/download guards remain authoritative.

**Tech stack:** TypeScript, Jest, Playwright, Nx. No added dependencies.

- [x] Add failing tests in `tools/conformance/harness/local-chrome-launch.spec.ts`
      for defaults, exact tool flags, 4B override, default-with-tool-interfaces,
      invalid values, and immutable inputs.
- [x] Implement `tools/conformance/harness/local-chrome-launch.ts` with TSDoc,
      immutable returned options, and allowlisted browser experiment selection.
- [x] Integrate into `local-models.playwright.config.ts` and
      `local-native-tools.playwright.config.ts`, and `local-media.playwright.config.ts`, retaining all CI/download guards,
      and add report metadata for native selections.
- [x] Update `tools/conformance/README.md` and retain a current research report
      with pinned source/evidence boundaries and remaining model decisions.
- [x] Run conformance build/test/lint and 30 local phase contracts; inspect
      current Ollama provider evaluation independently of deterministic checks.
- [x] Independent review; fix findings; PR, merge after required CI, verify
      merged tree and local contract smoke. Ask before selecting/downloading new models.

Completed in PR #754, merged at `81595863cb5579a327c7186a427704c04830e7e0`;
fresh merged-tree verification passed 52 unit tests and 30 phase contracts.
The user subsequently approved Gemma v4_4b acquisition and qualification.
