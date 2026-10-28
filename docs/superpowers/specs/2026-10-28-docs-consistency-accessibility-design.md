# Docs consistency and accessibility

Continue the approved canonical rollout with a focused consistency and accessibility pass. Retain LLA styling, all panels, current typography, genuine framework rendering, bottom synchronized timeline and immutable replay. No SDK release, dependencies, new topic or visual redesign.

## Confirmed defects and behavior

Inspector and request-detail tablists currently expose every tab to Tab and lack arrow/Home/End navigation. Implement one shared small DOM tab helper with automatic local activation, roving tabindex, left/right wrap and Home/End. Ignore modified keys and Up/Down in horizontal lists. Keep aria-selected, aria-controls and active panel labelling correct. Give each panel a keyboard entry so text/code can be read and scrolled. Request detail rebuilds must preserve logical focus on the replacement tab. Do not focus a panel or tab during token updates; keyboard activation stays local and makes no network requests or state writes.

Global playback shortcuts must not override focused links, disclosure summaries, editable content or interactive ARIA widgets. Preserve document/body playback shortcuts and existing handled-key guards. The bottom native range must expose meaningful aria-valuetext naming turn, event, milestone and elapsed time, with an empty state. Retain native slider keys, busy restrictions and timeline semantics. Expose concise polite chat lifecycle status only when its text changes, never per token; do not turn the streaming transcript or inspector JSON into live announcements. Retain historical managed-chat callbacks and Threadplane's scoped inert composer.

Docs video figures retain native on-demand controls, caption tracks and plain-text walkthrough links. Associate the visible concise caption with the player and give text-walkthrough links context-specific accessible names, including multiple same-topic demos on a page. Keep provenance separate and preserve all recording disclosures. Do not autoplay or replace existing footage merely for keyboard fixes.

## Content consistency

Audit canonical guide entry points for current video-first introductions, framework-specific workbench links and precise distinctions between partial output, source completion and application acceptance. Update the two workbench overviews with concise keyboard/readout instructions in Brian's pre-2025 technical voice. Add missing overview links only where useful, retaining local-only server topics and separately installed Threadplane scope. Reorganize media README to lead with current canonical recording sources and clearly label retained fixture recordings; preserve historical provenance details. No broad rewrite of examples or changes to recorded capabilities.

## Verification

TDD for tab keyboard/focus and rebuild behavior, shortcut noninterference, scrubber semantics, lifecycle announcement deduplication and video accessible associations. Extend checked browser verification with real keyboard interactions for both SDKs, Requests detail and replay, without fixtures in publication. Audit canonical media references and caption timing/assets. Full www build/test/lint/TypeScript, hosted workbench packaging/lint, complete framework browser matrix and route/mobile reports. Independent spec/quality review, PR, merge current head on green, then exact merged production deployment, keyboard behavior and public video captions/media verification. Keep useful existing local servers and worktree; release remains user-owned.

References: WAI APG tabs https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ and slider https://www.w3.org/WAI/ARIA/apg/patterns/slider/.
