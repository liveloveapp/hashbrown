# Concept-first documentation

## User-approved direction

Brian requested one thorough PR across the documentation: recorded teaser first, general concept introduction, reusable application code, then a distinct workbench implementation and deeper walkthrough. Keep his plain, task-first voice; consult 2024 and older posts in ~/repos/brianflove. PR and merge on required green checks; no SDK release.

## Teaching structure

Concepts and recipes use: title, existing relevant video, topic-specific introduction explaining what/why/when, accessible flow diagram where useful, ordinary application implementation with real public APIs and imports, then `## Explore it in the workbench` with canonical code excerpts, turn/state observations, inspectable moments and honest boundaries. End with relevant next steps. Generic snippets cannot depend on workbench helpers, private imports, undeclared globals or invented APIs. Clearly mark focused excerpts and explain prerequisites. Use an ordinary domain when it distinguishes the first implementation.

Adapt that order to onboarding, providers, guidance and migrations. Preserve the page purpose: setup and upgrade guidance comes before the workbench connection. Model selection and ethics need reasoning, not invented runnable code. Provider pages can reuse a clearly identified client teaser; never imply it records an unrecorded provider. Generated API reference is outside authored learning-guide scope.

## Diagrams

A static server-rendered `hb-concept-diagram` with a named concept catalog renders semantic ordered steps, visible descriptions and caption. Responsive CSS stacks flows on small screens. No scripts, canvas, animation or new dependencies. A rehype normalization lifts standalone diagram elements out of paragraph wrappers before React renders their figures, and rejects inline or emphasized diagram paragraphs to prevent hydration errors. Supported concept names: generative-ui, tools, structured-output, streaming, conversation, workflow, persistence, client-server, decisions, runtime, local-models. Use only supported names.

## Scope

Audit all 110 authored English pages in www/content/docs, both frameworks. Preserve media IDs, recording disclosures, transcripts, working URLs, stable anchors, API references, validation/authorization boundaries, and useful existing implementation detail. Move workbench-specific explanations into the later section rather than deleting them. No SDK changes or new recordings needed for this teaching rewrite.

## Validation

Every page and framework pair receives an editorial review. Check generic snippets against public APIs and existing fixture suites; compile representative additions. Add meaningful tests for diagrams, supported diagram references, and teaching order. Run docs lint/test/build and route/mobile reports; inspect representative pages in a real browser at desktop/mobile widths. Independent review, then one PR and merge only after required checks. Verify merged deployment.
