# Pinned .NET SDK And Immutable Release Retry Plan

> **For agentic workers:** Use executing-plans with independent review before integration. The maintainer has approved publication and continued necessary fixes without another approval round.

**Goal:** Finish publishing the reviewed 0.8.1 release after the publisher's affected checks failed because pinned .NET SDK 10.0.402 was absent.

**Architecture:** Add the same setup-dotnet action/global.json configuration used by main CI. Preserve immutable v0.8.1 at its reviewed source. A manual retry runs the repaired workflow from protected main, validates and checks out an existing stable release tag, then runs complete release checks without using the dispatch main SHA for affected selection. Retain the existing trusted publishing identity, serial publication and registry verification.

**Alternatives:** Re-running the unchanged workflow repeats the missing-SDK failure. Moving the immutable version tag loses reviewed release identity. Building the existing release tag with a repaired manual workflow preserves it without credentials changes.

**Tech Stack:** GitHub Actions, existing npm trusted publishing, Nx and pinned .NET setup.

- [x] Preserve failed publisher logs and confirm publication steps never ran.
- [x] Independently review retry design, including dispatch SHA versus checkout SHA, input handling and protected-main ancestry.
- [x] Add pinned SDK setup, stable-tag manual dispatch and complete manual release checks in `.github/workflows/npm-publish.yml`.
- [x] Document retry in `docs/release-runbook.md`.
- [ ] Validate workflow expressions with actionlint, run existing release verifier checks, review final diff independently, and commit through normal hooks.
- [ ] Open/attach repair PR, merge on required green checks, then dispatch from main with release_tag=v0.8.1. Do not alter version tag or SDK files.
- [ ] Follow publication to success, verify all ten registry artifacts, and complete isolated published-consumer browser/recipe verification from the original release source.
