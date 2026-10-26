# Canonical workbench lessons

The canonical two-step plan conversation will teach generative UI, browser tools,
and structured output in React and Angular. The user selected keeping all panels
visible while simplifying spacing and colors. Keep the LLA light canvas, Hanken
Grotesk, JetBrains Mono, ink actions and cobalt selection. Keep the bottom
synchronized timeline, retained conversations and contextual Console drawer.

Use light code surfaces, smaller headers, quieter metadata and a compact milestone
timeline. Collapse repetitive stream chunks into milestones visually, retaining
all captured frames and a raw-events switch. The inspector shows one selected
view; the far-right drawer explains that selection rather than repeating it.
Keep keyboard-accessible controls, independent vertical scrolling and narrow
layout without horizontal document overflow.

Three lesson presets are selected by a validated URL query and left navigation:
Generative UI (UI API, JSON/props focus), Tools (UI API, requests/tool focus),
Structured output (structured-chat API, typed plan schema). A preset never starts
a model request. Changing lessons cancels active generation and mounts an
independent session. Keep the current two-turn plan and explicit Accept plan
interaction across all lessons. Structured output must use real useStructuredChat
and structuredChatResource; rendering is application-owned, not model-selected.

The shared capture model may accept either native UI output or plain plan data,
with explicit format configuration and unchanged freshness/completion guards.
The local server must choose a fixed server-owned schema/system/tools by an
allowlisted lesson endpoint, never trust arbitrary browser schemas. Both
structured and UI lessons call the readContext tool before each answer. Provider
credentials stay server-side and replay never executes model/tool/action work.

Replace the first example and recording in the six matching concept guides.
Preserve useful advanced API material but use SummaryCard/readContext/plan values
for the main teaching path. Use the author's pre-2025 posts as voice reference:
plain first-person teaching, small concrete examples and explicit observations.
Include checked source excerpts, local lesson launch URLs, cross-links and result
screenshots. Keep separate React/Angular videos for each lesson. Generate footage
from the real provider and real SDKs, disclose provenance, provide MP4/WebM,
posters, captions and text walkthroughs. CI runs deterministic stream fixtures,
with live-provider verification before publishing recordings.

Verify capture/acceptance/replay boundaries, all six lesson/framework paths,
failed/incomplete/cancelled responses, retained conversations, switching lessons,
and narrow viewport layout. Run www build, tests, lint and route report, review,
PR, merge only on green, and verify public guides and media. No SDK release.
