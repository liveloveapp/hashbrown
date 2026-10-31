# November Social Cards Implementation Plan

> Execute inline, retaining the existing dedicated worktree. Review assets and publication evidence before declaring completion.

**Goal:** Replace all nine November 2–8 draft card assignments with the approved research-informed visual direction, present the complete illustrated week, and retain dry-run and draft status.

**Architecture:** Render nine static PNGs from local HTML/CSS compositions with original photo-kit portraits and existing recorded workbench screenshots. Publish immutable v2 URLs through the website, verify their hashes, then edit only each existing draft's image object. Keep queue IDs, copy, sources, schedule and status unchanged.

**Tech stack:** Existing browser rendering, Node crypto, website static files and marketing CLI; no new dependencies or public APIs.

## Asset design

- Monday X: square approachable portrait, “Local models. Real limits.”
- Tuesday LinkedIn: 4:5 approachable portrait, “Local models. Real limits.”
- Tuesday X: square analytical portrait, “Valid JSON. Wrong answer.”
- Wednesday X: square graphic, “The app picks the tool.” with one ordered tool sequence.
- Thursday LinkedIn: 4:5 straight crop of accepted application state, “Your app decides.”
- Thursday X: square actual component capture, “Preview before you apply.” A narrow layout of the unchanged recorded replay keeps the plan legible.
- Friday X: square clearly illustrative truncated JSON string, “One token. Broken JSON.”
- Saturday X: square restrained thinking portrait with “Start smaller.” and a single-component illustration.
- Sunday X: square device/network illustration, “Local ≠ offline.”

## Steps

- [x] Read the current production week and retain a before snapshot; confirm nine drafts and dry-run.
- [x] Create and render local source compositions, using original photographs without face or wardrobe edits.
- [x] Inspect all nine at native and feed size; verify dimensions, content bounds, provenance, alt text and the 5 MiB limit. Obtain independent visual/factual review.
- [ ] Save the research, asset provenance and public PNGs. Run applicable website checks and review the PR.
- [ ] Publish through a PR, merge on green, and verify production bytes at all nine URLs.
- [ ] Change only image metadata on the nine existing draft rows. Compare IDs, copy, schedule, sources and statuses against the before snapshot.
- [ ] Refresh the illustrated week with full copy, first comments, images, alt text, dimensions and provenance. Verify desktop/mobile rendering, keep dry-run enabled and show the review.

No post approvals, public social posts, new dependencies or publishing-mode changes are authorized by the card-design approval.

## Concrete inputs and outputs

The artifact root is the task's local, untracked marketing artifact directory. Store editable HTML/CSS, copied original photo inputs, render/verification scripts, before/after queue snapshots and the new provenance manifest in `social-cards-v2/` there. Refresh `illustrated-week/index.html` and its local asset copies after queue verification. Preserve the preceding review and assets as a rollback reference.

Use original-wardrobe PNGs from `~/Pictures/headshot-pilot-production-kit/portraits/`: BL-002 approachable, BL-018 broad smile, BL-025 analytical thinking, and BL-003 skeptical thinking. Preserve the original right/bottom crop; no mirroring or face/wardrobe edits. Product inputs are `www/public/marketing/2026-11-02/workbench-preview.png` and `workbench-accepted.png` from the recorded Chrome replay.

| Key / PNG basename       | Existing draft ID                    | Pixels      |
| ------------------------ | ------------------------------------ | ----------- |
| mon-x-web-llms           | f424f6bb-93d3-4f7d-8f47-5ce8313aa8fe | 1200 × 1200 |
| tue-li-web-llms          | 1dae0266-7c5c-4e8e-964e-4afb32f3582d | 1200 × 1500 |
| tue-x-schema-correctness | 9d013a17-20f9-4a28-bc92-c785af350a51 | 1200 × 1200 |
| wed-x-tool-phases        | 988b4799-83e1-4dfe-b07f-d87b1b7ae943 | 1200 × 1200 |
| thu-li-workbench         | ce1c2113-574c-4961-82cb-91853243d06f | 1200 × 1500 |
| thu-x-workbench          | 96f3da18-c0b1-469e-9858-b3309282393a | 1200 × 1200 |
| fri-x-json-termination   | 34609bc0-9b7a-4e44-b21e-04e2fb2608ce | 1200 × 1200 |
| sat-x-small-catalog      | 434f60e5-8111-4387-bdc4-b4f40d955f4d | 1200 × 1200 |
| sun-x-local-network      | 273939e0-f80e-4aec-a8f1-e3dfcaf33d8b | 1200 × 1200 |

Publish each basename under `www/public/marketing/2026-11-02/v2/`, corresponding to `https://hashbrown.dev/marketing/2026-11-02/v2/<basename>.png`. Add a provenance manifest beside the public PNGs, with source/treatment, dimensions, alt text and digest. Do not commit the private photo masters. Save the sourced research in `docs/marketing/2026-10-31-thumbnail-research.md`.

## Queue and verification procedure

Read `npx nx run marketing:week --output-style=static -- show --week 2026-11-02`, sourcing the existing private env in each process. Capture the full JSON before editing. For each ID, reread immediately before writing; stop if any original field has changed. Use `edit --post <id> --file <patch.json>` with only `{draft: {...originalDraft, image: {url, altText, sha256}}}`. Never supply scheduling, status, sources or kind fields. Afterward compare every non-image field against the before snapshot and assert all nine IDs and draft statuses are preserved. A partial failure must be reported and resumed from a fresh comparison; do not re-import the week.

Read the deployed production `MARKETING_DRY_RUN` setting before and after via the existing Vercel API helper, exposing only a boolean result, never secret values. No setting writes are needed.

Visual acceptance: inspect each rendered PNG at native and 320–375 px feed widths with copy; check headline bounds, portrait crop edges, readable product evidence, accurate illustration provenance and alt text containing the meaningful headline. No files over 5 MiB or failed image loads. Illustrations must not masquerade as screenshots or measured traces.

Run `npx nx build www`, `npx nx test www` and `npx nx lint www`; inspect results. Create and attach the PR, review its final asset/Markdown diff, merge only after required checks pass, and confirm production deployment completion. Before editing the queue, fetch all nine static production URLs without redirects and verify HTTP 200, PNG MIME/signature, expected dimensions and matching SHA-256. If checks, deployment or digest verification fail, fix the failure and retain the original queue assignments until verified. Recheck desktop/mobile illustrated-review rendering after the final image-only update.
