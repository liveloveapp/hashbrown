# Threadplane and server request customization

Continue the user's approved docs pattern: Brian's pre-2025 technical voice, recorded demos first, a small visible task, practical explanation, and complete checked files in closed disclosures. Preserve independent scrolling and Migrations last/collapsed. No SDK release or new dependencies.

## Independent workstreams

1. Retire the React CopilotKit recipe and navigation/search/media backlog entry. Preserve its HTML and Markdown routes with permanent redirects to the React Threadplane guide. Do not remove SDK interop or historical design research.
2. Document using Hashbrown's server with Threadplane's headful chat in Angular and React, plus moving existing Hashbrown chat presentation to Threadplane. Verify APIs from ~/repos/angular-agent-framework. Distinguish replacing the chat UI from replacing an agent/backend; avoid promising automatic history, tool, generated-component or persistence migration. Do not describe Threadplane as preview. Do not invent public React installation instructions if packages are private. Prefer source-grounded examples and honest package availability without a preview label.
3. Replace request transformation snippets with a complete checked server/client workflow for both SDKs. Demonstrate server-owned instructions/context before the provider call, keeping the model, authentication and authorization server-owned. Preserve adapter options, tools, schema, store/include invariants; reject context/authorization failures instead of silently continuing. Test the real transform and record through the real checked clients/server with scripted output only at the provider boundary, clearly disclosed.

## Verification

Tests first for behavior and docs discovery. Existing strict Angular/React/server typecheck; www test/lint/build/route report. Run generated output tasks sequentially. Capture real browser interactions, encode with ffmpeg, inspect playback, captions, screenshot and aspect. Check both frameworks, mobile overflow, source disclosures, sidebar scrolling and retired routes. Open PR, attach it, merge exact green head, confirm production deployment and live pages/assets. User handles release.
