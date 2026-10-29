# Concept-first documentation implementation plan

**Goal:** Teach the concept and reusable application implementation before the canonical workbench on all authored Angular/React guides.

**Architecture:** Preserve markdown/media, add a static semantic diagram component to the existing markdown map. No SDK or dependency changes.

## 1. Audit

Inventory 110 authored pages, existing media, anchors, tests and Brian's older technical prose. Use current origin/main in the managed docs-concept-first worktree. Record approved teaching structure in the accompanying spec.

## 2. Diagrams

Write failing tests for known catalog entries, ordered accessible descriptions, invalid identifiers and markdown registration. Implement ConceptDiagram.tsx/catalog/CSS under www/src/components/elements; register in docs-components.tsx. Stack on mobile. No client JS.

## 3. Parallel authoring

Use disjoint page families: concepts; recipes; platforms/migrations; primary agent owns start/guide pages, diagrams, integration and tests. All authors read the spec, consult older technical prose, preserve APIs/provenance/anchors and do not run heavyweight builds or mutate Git. Teach actual reusable examples, not boilerplate introductions.

## 4. Editorial and example verification

Review every page/framework pair and all source claims. Fix undeclared prerequisites, fake APIs, private workbench helpers in generic examples and misleading copying claims. Add compiled representative snippets using existing fixtures. Test teaching order and supported diagram references without snapshotting prose.

## 5. Validate

Format; run www lint/test/build and route/mobile e2e. Browser-review concepts, recipes, onboarding, providers, guidance and migrations, including mobile flow diagrams and long code. Independent final review; resolve findings.

## 6. Deliver

Commit and push one full PR; attach it. Integrate main updates if branch protection requires. Merge only on required green checks and verify public pages. No SDK release.
