---
title: 'Rename Markdown Rendering to Prose'
meta:
  - name: description
    content: 'Migrate renderer imports, types, styles and workbench URLs to prose in the next minor release.'
---

# Rename Markdown rendering to prose

<hb-docs-demo demo="canonical-workbench-prose-react">
</hb-docs-demo>

The replay shows the current prose renderer using an existing OpenAI capture. It does not run the earlier APIs in the table below.

The next minor release renames Magic Text to **prose**. This is a breaking rename with no deprecated exports or compatibility aliases. Rendering, streaming, parser completion and citation behavior stay the same. This guide describes the upcoming release; install its matching core and framework package versions together when it is published.

## Update imports and templates

| Previous name                  | New name                   |
| ------------------------------ | -------------------------- |
| `MagicTextRenderer`            | `ProseRenderer`            |
| `createMagicTextNodeRenderers` | `createProseNodeRenderers` |
| `MagicText*` types             | `Prose*` types             |

Keep using `exposeMarkdown` with the same configuration. Its renderer-related type signatures now use the `Prose*` types. The underlying Markdown parser still comes from `@cacheplane/partial-markdown`.

## Update styles and links

Replace every `hb-magic-text-` CSS class prefix with `hb-prose-`, including root, segment, citation, citation-label and caret hooks. Rename custom animation references from `hb-magic-text-segment-enter` to `hb-prose-segment-enter` if you reference that keyframe.

The recipe now lives at [/docs/react/recipes/prose](/docs/react/recipes/prose). Workbench lesson IDs and query strings use `prose`, and the example endpoint is `/api/workbench/prose`. Replace `<hb-magic-text-demo>` with `<hb-prose-demo>` in custom documentation integrations. The old recipe path and lesson ID are removed.

## Verify the migration

Build your application to catch old imports and type names. Check your custom renderer templates, citation callbacks, streaming caret and segment animations. A stopped or failed partial response still needs parser finalization; `isComplete` remains separate from request success.
