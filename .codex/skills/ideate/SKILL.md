---
name: ideate
description: Capture and document a new idea in this repo. Use when the user says things like "help me brainstorm", "I have an idea", or "let's capture this for the future" and wants it recorded in `design/ideas/` with a summary, supporting research (repo context + web if useful), and a sketch.
---

# Ideate

## Overview
Capture a user's idea and write a single markdown file in `design/ideas/` using the required format: Idea summary, research, and a sketch in a code block.

## Workflow
1. **Clarify briefly if needed**: Ask 1–3 quick questions only if the idea is too vague to summarize or research.
2. **Read local context**: Enumerate and read all files under `design/` (recursive). Summarize only what is relevant to the idea.
3. **Do research**: Use both local context and web research when it materially improves the idea. Prefer concise, credible sources.
4. **Write the idea file**:
   - Ensure `design/ideas/` exists; create it if missing.
   - File name: `YYYY-MM-DD-<kebab-idea-title>.md`. If a file already exists, append `-2`, `-3`, etc.
   - Content format must be exactly:

````md
# Idea

{summarization from the user}

# Research

{agent research supporting the idea}

# Sketch

```{format}
{agent generated sketch (ASCII, Mermaid, or pseudocode UI)}
```
````

## Sketch guidance
- Use a single code block in the Sketch section.
- Preferred formats: `mermaid`, `text`, or `md` (ASCII wireframe). Pick the one that best conveys the concept.
- Keep the sketch lightweight and illustrative, not exhaustive.

## Research guidance
- Incorporate relevant findings from `design/` files first.
- Add web research only when it adds concrete value; include source links in the Research section when used.
- Keep it concise and directly tied to the idea.
