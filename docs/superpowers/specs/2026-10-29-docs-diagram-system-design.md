# Documentation diagram system

## Approved direction

The user approved the companion gallery at `http://localhost:54176/`: purpose-built components, static diagrams, optional expansion, and existing LLA typography, warm surfaces, borders, spacing, and restrained accent. Implement this direction, audit all authored Angular and React guides, add diagrams where they explain a concept, then PR and merge on green. The SDK release remains user-owned.

## Components

A shared server-rendered SVG canvas supports architecture, data flow, state, and entity relationship diagrams. A sequence renderer handles participants and ordered messages. Typed definitions describe nodes, labeled connections, boundaries, fields, and cardinality. Explicit author-controlled placement keeps instructional diagrams predictable. Shared rendering primitives cover repeated presentation without introducing a general diagram editor or a third-party graph runtime.

The figure supplies a title, concise caption, and a plain-language text description. A small client frame provides an accessible native dialog for expansion: focus containment, Escape, close button, and focus return. On small screens, diagrams retain readable text and scroll within their own region. Print exposes the static diagram. Reduced motion is respected by avoiding animation. Each diagram renders without JavaScript; expansion is progressive enhancement.

Markdown uses `<hb-diagram diagram="identifier"> </hb-diagram>`. The block normalization used by existing concept diagrams extends to the new tag. Unknown identifiers and malformed definitions fail during validation/build instead of disappearing silently. Shared definitions serve both frameworks where architecture is the same. Framework-specific claims use separate definitions when necessary.

## Content and audit

Review all 110 authored guides, including concepts, recipes, onboarding, integrations, and migrations. Record every page's teaching question, diagram decision, placement, definition ID, and source evidence. Do not require one diagram per page. Preserve video-first teaching, standalone application examples, deeper workbench sections, real recordings, inline workbenches, and existing bookmarks. Keep existing simple numbered concept flows where they remain useful, replacing redundant ones when a relationship diagram teaches better.

Place general diagrams after the introduction and before application code. Place implementation-specific diagrams next to the corresponding implementation. Diagrams answer a focused question and identify simplified/illustrative models explicitly. Database diagrams use real schema names/relationships verified against the reference; they must not imply Hashbrown SDK persistence APIs. Approval, previews, completion, persistence, restore and resume remain separate operations. Use Brian Love's practical explanatory voice, with direct short captions.

## Validation

Test definitions and Markdown integration, static accessible output, malformed IDs/endpoints, text layout, and dialog behavior. Verify browser expansion/focus/Escape, multiple diagrams, mobile overflow and print styling. Run the full www tests, strict snippet compilation, lint, production build, route/mobile reports. Independently review components and source-backed diagram content before PR. Merge only on passing required checks, then verify deployed pages and expanded diagrams.
