# Images for every social post

**Goal:** Every queued X and LinkedIn post has a reviewed screenshot or thumbnail, and publishing never silently drops it.

**Architecture:** Store one static image URL, alt text and SHA-256 in each social draft. Queue import/edit/approval and dispatch enforce the metadata. Live adapters download bounded PNG/JPEG bytes from the site's marketing path and check the digest before uploading. X uses v2 media upload and metadata, LinkedIn uses image initialization and binary upload. Public post creation remains the final operation and preserves existing unknown-outcome handling.

**Tech stack:** Existing TypeScript, Node fetch/crypto, Zod and Vitest. No new dependencies.

- [x] Capture meaningful failing tests for old text-only import/dispatch/approval behavior.
- [x] Add bounded source validation and immutable-byte download checks.
- [x] Implement and test both channel upload protocols without live posting.
- [x] Create and visually review all nine asset assignments (eight images).
- [ ] Review, build, test and lint the final change; prepare a PR.
- [ ] Publish assets and code, then edit each existing draft without changing its ID or approving it.
- [ ] Reauthorize X with media.write, qualify uploads only after consent, and present the illustrated week.

Dry run remains enabled. All nine posts remain drafts. No public post or simulated approval is part of this change.

Primary protocol evidence: XDK OpenAPI 2.159 at https://raw.githubusercontent.com/xdevplatform/xdk/main/latest-openapi.json (metadata.alt_text and associated_metadata.alt_text), https://docs.x.com/x-api/media/upload-media, and LinkedIn Images API https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-06. Accessed October 30, 2026. The rendered X metadata reference omits alt_text; the primary OpenAPI schema includes it. Network qualification is separate from mocked contract tests.
