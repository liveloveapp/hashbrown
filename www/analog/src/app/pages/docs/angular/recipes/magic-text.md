---
title: 'Magic Text in Angular: Streaming Markdown'
meta:
  - name: description
    content: 'Use Hashbrown Magic Text in Angular for optimistic streaming Markdown rendering, citations, exposeMarkdown(), and custom renderers.'
---

# Magic Text in Angular

## 1. Intro

Magic Text is Hashbrown's optimistic Markdown parser and renderer for streaming LLM output. It is designed to render partial Markdown while text is still arriving, then converge to the final structure as the stream completes.

Why this is useful in real apps:

- Streaming stability: users see useful formatted output early, even before the full response is done.
- Predictable rendering: content is parsed into trusted node types instead of arbitrary HTML.
- Incremental updates: unchanged segments stay stable while new content streams in.
- Animation-ready segmentation: text can be segmented (for example by word or grapheme), so you can animate newly arrived segments.
- Citation support: markdown citations can become interactive source links in your UI.

<hb-magic-text-demo></hb-magic-text-demo>

If you only need streaming Markdown, you can skip citations and move to `exposeMarkdown()`.

When you do want source links, Magic Text supports a citations extension:

- Inline reference: `[^source-id]`
- Definition: `[^source-id]: Source title https://example.com`

Prompt pattern you can give your model:

<hb-code-example header="system prompt excerpt">

```txt
Write in Markdown.

When you make a factual claim that needs a source, add an inline citation like [^id].
At the end, add a definition line for each citation:
[^id]: Short source title https://full-url

Do not invent URLs. Omit citations if you are unsure.
```

</hb-code-example>

For UI resources, @hashbrownai/angular!exposeMarkdown:function can append this citation guidance automatically by setting `citations: true`.

---

## 2. `exposeMarkdown()`

`exposeMarkdown()` is the easiest way to expose streaming Markdown to model-generated UI. It exposes a constrained component where the model controls only `children` (the Markdown content).

Default renderer example:

<hb-code-example header="ui-kit.ts">

```ts
import { createUiKit, exposeMarkdown } from '@hashbrownai/angular';

export const uiKit = createUiKit({
  components: [
    exposeMarkdown({
      citations: true,
      options: { segmenter: { granularity: 'word' } },
      caret: true,
      className: 'chat-markdown',
      onLinkClick: ({ mouseEvent, url }) => {
        if (url.startsWith('http')) {
          return;
        }
        mouseEvent.preventDefault();
      },
      onCitationClick: ({ citation }) => {
        console.log('citation clicked', citation);
      },
    }),
  ],
});
```

</hb-code-example>

Custom renderer example:

<hb-code-example header="ui-kit.ts">

```ts
import { createUiKit, exposeMarkdown } from '@hashbrownai/angular';
import { AppMarkdownRenderer } from './app-markdown-renderer';

export const uiKit = createUiKit({
  components: [
    exposeMarkdown({
      renderer: AppMarkdownRenderer,
      citations: true,
    }),
  ],
});
```

</hb-code-example>

Important behavior:

- With the built-in renderer, you can configure `options`, `caret`, `className`, `onLinkClick`, and `onCitationClick`.
- If you pass `renderer`, those built-in settings are not supported. Your renderer owns display and interaction.
- A custom renderer component must define both `text` and `isComplete` inputs.

You will typically pass `exposeMarkdown()` into:

- @hashbrownai/angular!createUiKit:function via `createUiKit({ components: [...] })`
- @hashbrownai/angular!uiChatResource:function via `uiChatResource({ components: [...] })`
- @hashbrownai/angular!uiCompletionResource:function via `uiCompletionResource({ components: [...] })`

---

## 3. MagicTextRenderer

The renderer component is exported as `MagicText` and used as `<hb-magic-text>`.

<hb-code-example header="magic-text.component.ts">

```ts
import { Component, input } from '@angular/core';
import { MagicText } from '@hashbrownai/angular';

@Component({
  selector: 'app-markdown',
  standalone: true,
  imports: [MagicText],
  template: `
    <hb-magic-text
      [text]="text()"
      [isComplete]="isComplete()"
      [options]="{ segmenter: { granularity: 'word' } }"
      [caret]="true"
      className="app-markdown"
    />
  `,
})
export class AppMarkdown {
  text = input.required<string>();
  isComplete = input(false);
}
```

</hb-code-example>

Inputs and outputs:

- `text` (`required`): current Markdown text (usually grows while streaming).
- `isComplete` (`default false`): marks the current text as finalized.
- `options`: partial parser options (`segmenter`, `enableTables`, `enableAutolinks`).
- `caret`: `true | false | TemplateRef` to show/hide/customize streaming caret.
- `className`: root class for styling.
- `linkClick`: emitted for link and autolink clicks.
- `citationClick`: emitted for citation clicks.

---

## 4. Custom Magic Text Renderer

Wrap `<hb-magic-text>` when you need to override node rendering, text segment rendering, or caret rendering.

<hb-code-example header="app-markdown-renderer.ts">

```ts
import { Component, input } from '@angular/core';
import {
  MagicText,
  MagicTextRenderNode,
  MagicTextRenderTextSegment,
  MagicTextRenderCaret,
} from '@hashbrownai/angular';

@Component({
  selector: 'app-markdown-renderer',
  standalone: true,
  imports: [
    MagicText,
    MagicTextRenderNode,
    MagicTextRenderTextSegment,
    MagicTextRenderCaret,
  ],
  template: `
    <hb-magic-text [text]="text()" [isComplete]="isComplete()" [caret]="true">
      <ng-template hbMagicTextRenderNode nodeType="citation" let-node="node">
        <sup class="citation">[{{ node.number ?? node.idRef }}]</sup>
      </ng-template>

      <ng-template hbMagicTextRenderTextSegment let-segment="segment">
        <span class="segment" [class.ws]="segment.isWhitespace">{{
          segment.text
        }}</span>
      </ng-template>

      <ng-template hbMagicTextRenderCaret let-depth="depth">
        <span class="caret" [attr.data-depth]="depth">|</span>
      </ng-template>
    </hb-magic-text>
  `,
})
export class AppMarkdownRenderer {
  text = input.required<string>();
  isComplete = input(false);
}
```

</hb-code-example>

Node override directives:

- Per-node override: `ng-template[hbMagicTextRenderNode]` with `nodeType="..."`
- Text segment override: `ng-template[hbMagicTextRenderTextSegment]`
- Caret override: `ng-template[hbMagicTextRenderCaret]`

All node types and the directive to use:

| Node type value                          | Structural directive    |
| ---------------------------------------- | ----------------------- |
| `document`                               | `hbMagicTextRenderNode` |
| `paragraph`                              | `hbMagicTextRenderNode` |
| `heading`                                | `hbMagicTextRenderNode` |
| `blockquote`                             | `hbMagicTextRenderNode` |
| `list`                                   | `hbMagicTextRenderNode` |
| `list-item`                              | `hbMagicTextRenderNode` |
| `table`                                  | `hbMagicTextRenderNode` |
| `table-row`                              | `hbMagicTextRenderNode` |
| `table-cell`                             | `hbMagicTextRenderNode` |
| `em`                                     | `hbMagicTextRenderNode` |
| `strong`                                 | `hbMagicTextRenderNode` |
| `strikethrough`                          | `hbMagicTextRenderNode` |
| `link`                                   | `hbMagicTextRenderNode` |
| `code-block`                             | `hbMagicTextRenderNode` |
| `thematic-break`                         | `hbMagicTextRenderNode` |
| `text`                                   | `hbMagicTextRenderNode` |
| `inline-code`                            | `hbMagicTextRenderNode` |
| `soft-break`                             | `hbMagicTextRenderNode` |
| `hard-break`                             | `hbMagicTextRenderNode` |
| `image`                                  | `hbMagicTextRenderNode` |
| `autolink`                               | `hbMagicTextRenderNode` |
| `citation`                               | `hbMagicTextRenderNode` |
| `node` (fallback for any unhandled type) | `hbMagicTextRenderNode` |

To expose your custom renderer to the model, pass it to `exposeMarkdown()`:

<hb-code-example header="ui-kit.ts">

```ts
import { createUiKit, exposeMarkdown } from '@hashbrownai/angular';
import { AppMarkdownRenderer } from './app-markdown-renderer';

export const uiKit = createUiKit({
  components: [
    exposeMarkdown({
      renderer: AppMarkdownRenderer,
      name: 'Markdown',
      description: 'Render Markdown content for the user.',
    }),
  ],
});
```

</hb-code-example>
