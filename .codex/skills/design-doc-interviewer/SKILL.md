---
name: design-doc-interviewer
description: Interview the user to turn a proposed product/engineering change into a structured design document. Use when the user asks to be interviewed, wants help clarifying a design, or wants a design doc produced from Q&A. Emphasize numbered questions (few at a time), capture requirements/constraints/UX/data/logic/testing, and output a clean design doc.
---

# Design Doc Interviewer

## Overview

Elicit the minimum set of decisions and details needed to produce a clear design document, using short, numbered question batches and progressive refinement.

## Workflow

### 1) Align on format and scope

- Ask for the intended audience, affected systems, and whether there is a preferred template or example to mirror.
- If the user provided a sample doc, follow its section order and tone.
- Identify the target package in this monorepo. If unclear, ask the user to pick one of the packages managed here before proceeding.

### 1.5) Pre-flight repo context

- Search `design/*` with emphasis on `design/ideas/` for related context before asking detailed questions.
- Summarize any relevant findings and confirm whether they should be incorporated.

### 2) Run a structured interview in small batches

- Ask **2–4 numbered questions per turn**.
- Keep questions concise, unambiguous, and grouped by section.
- After each response, confirm key points and update the working outline.

Use the question bank when needed: `references/question-bank.md`.

### 3) Draft the design doc incrementally

- Populate sections as soon as sufficient information is available.
- Mark unknowns as **Open Questions** rather than blocking progress.
- Use the template for consistent structure: `references/design-doc-template.md`.

### 4) Review for completeness and risk

- Check for missing: goals/non-goals, data model/API changes, compatibility, rollout, testing.
- Ask final clarifying questions only for high-impact gaps.

### 5) Deliver the final document

- Output a clean, single-pass doc with headings and code fences where needed.
- Preserve the user’s terminology and system names.
- Always save the final design doc at `design/{package}/` where `{package}` is a package managed in this monorepo. Create the directory if it does not exist.

## Interview Style Rules

- Number all questions.
- Keep question batches small (2–4).
- Prefer concrete, scenario-based prompts over abstract ones.
- Avoid asking about sections the user explicitly scoped out.

## References

- `references/design-doc-template.md` for the canonical structure.
- `references/question-bank.md` for section-specific prompts.
