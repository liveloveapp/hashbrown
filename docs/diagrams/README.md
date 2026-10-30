# Diagrams in the documentation

A diagram should answer a question the reader has at that point in the guide. Start with the relationship, handoff, or decision that is difficult to explain in prose. Keep the figure focused, then let the code show the implementation.

## Audit coverage

All **110 authored Angular and React guides** were reviewed. **98 pages** now use the new components, with **118 placements** sharing **45 definitions**. Six pages retain useful existing concept flows; six need no added diagram. No generated API prose was changed.

The audit records every individual framework/page, its teaching question, placement, and checked sources:

- [Concepts](concepts-audit.md): 30 pages.
- [Recipes](recipes-audit.md): 26 pages.
- [Onboarding and guides](learning-audit.md): 20 pages.
- [Integrations and migrations](integrations-audit.md): 34 pages.

## Add a diagram

Use a stable catalog identifier in Markdown, in its own block:

```html
<hb-diagram diagram="request-boundary"> </hb-diagram>
```

Put a general diagram after the teaser and introduction, before the reusable application example. Put an implementation-specific diagram beside the implementation it describes. A page may need both, or neither. Preserve the distinction between the general lesson and the workbench.

Definitions live in `www/src/components/diagrams/catalog/`; `diagram-catalog.ts` registers them. Both framework guides can use the same definition when the architecture is the same. Threadplane's Angular and React ownership differs, so those diagrams have separate definitions.

Use `DiagramDefinition` from `diagram-types.ts`:

- **Architecture** groups components by responsibility or system boundary.
- **Sequence** lists named participants and ordered messages; time runs downward. Message labels wrap between participants. Mark returned data with `dashed: true` where that convention helps.
- **ERD** lists actual table/field names, declared keys, and explicit cardinality labels. Identify any deliberately simplified model.
- **State** labels the action or event that permits each transition. Distinguish approval, execution, and confirmed success.
- **Flow** shows data moving through transformations. Distinguish partial previews from completed results.

Graph definitions supply a canvas size, positioned nodes, and connections. `nodeMetrics()` computes node height from its wrapped title, detail and fields. Edges can use derived orthogonal routes or explicit points. Leave space for labels, and use explicit routes when a derived route would cross another node. Keep ERD nodes wide enough for the field name and type on the same row. Source comments name the implementation behind each definition.

## Reading and accessibility

The SVG and text description render on the server. The client frame only measures overflow and opens a native dialog. A diagram remains available without JavaScript. The figure has a title, caption, and **Read the diagram** text alternative; expansion carries that description into the modal too.

Large diagrams retain their text size in a contained horizontal scroller. The frame explains scrolling when needed. **Expand diagram** opens a larger view; Escape and Close return focus to the invoking button. The dialog header stays visible while its content scrolls. Printed diagrams fit their page without expansion controls.

The presentation follows existing LLA/hashbrown tokens: Hanken Grotesk, JetBrains Mono, flat warm surfaces, restrained accents and visible focus. Do not use color alone to identify a state or relationship. Avoid animation, decorative nodes, and invented guarantees.

## Check the result

Run the diagram and coverage tests:

```sh
npx vitest run --config www/vitest.config.mts www/test/docs-diagrams.spec.tsx www/test/docs/diagram-coverage.spec.ts
```

The tests validate definitions, Markdown integration, unknown references, unique catalog identifiers, readable wrapped labels, equivalent modal text, every audit row, and catalog usage. The production build renders each used definition. Run `npx nx e2e www` for route and mobile layout checks.

Review the rendered diagram as well. Check that labels stay inside the canvas, do not cover nodes or other labels, and attach clearly to the right relationship. Open the expanded view with a keyboard, read its description, and close it with Escape. At phone width, the diagram should scroll within its figure while the document keeps its normal width. Verify database relationships and execution ownership against source rather than inferring them from a visual pattern.

## Keep the reading path short

Use a natural canvas width of **740 pixels or less**. Cards and labels keep their text size; a narrow drawing stays at its authored size rather than stretching to fill the article. Prefer a downward handoff or two columns to a long horizontal chain. Keep branches where the reader needs to distinguish outcomes. Put supporting detail in the caption and text description instead of adding another lane.

The [readability audit](readability-audit.md) records the before and after widths. The pass preserves all 45 definitions and their placements. Request boundaries use a vertical request/return path; schema and validation diagrams use two columns; persistence tables stack so field names and key/type columns remain legible. Sequence diagrams keep their actors and use narrower cards with wrapped messages. The descriptions still explain the ownership, validation and persistence rules behind each diagram.

The browser audit now runs in `www:e2e` after the production build. It checks every Markdown placement in Angular and React at desktop and 320px, using loaded fonts and native dialogs. It checks text and node geometry, article fit, contained mobile scrolling, expansion, both Tab directions, Escape, Close and restored focus. Unexpected POST requests fail the audit and are blocked. Unit fixtures verify that the audit detects broken geometry and missing or duplicate placements.

To run only this audit against a local production build:

```sh
npx tsx www/src/tools/diagram-report.ts
```

The report starts and stops its own Next server on an available port. Results and failure screenshots go to `dist/docs-diagrams/ci`; failed PR checks upload that directory with the other runtime diagnostics. To inspect a deployed build, set `DOCS_DIAGRAM_ORIGIN=https://hashbrown.dev`. `DOCS_DIAGRAM_OUTPUT` selects a separate report directory.
