---
title: 'Streaming Inline Markdown with Magic Text: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Build chat UIs that stream inline Markdown, citations, and custom-rendered fragments using Hashbrown Magic Text for Angular.'
---
# Streaming Inline Markdown with Magic Text

Magic Text is Hashbrown's streaming-safe inline Markdown parser. It turns partially generated text into fragments you can animate, link, and cite without letting the LLM inject arbitrary HTML. This recipe shows how to add it to an Angular chat UI, wire citations, and replace render nodes when you want full control.

You should be comfortable with:

- Standalone Angular components and signals
- Basic Hashbrown Angular setup (see **[Quick Start](/docs/angular/start/quick)**)
- Using @hashbrownai/angular!uiChatResource:function (or any streaming text source)

---

## 1) What Magic Text does (and does not do)

Magic Text parses **inline-only Markdown**:

- Supported: `*em*`, `**strong**`, `` `code` ``, `[links](https://…)`, and footnote-style citations `[^id]`
- Not supported: block elements (headings, lists, paragraphs, blockquotes)
- Safe links: only `http`, `https`, `mailto`, `tel` protocols; others are dropped
- Streaming-friendly: fragments carry `state: 'provisional' | 'final'` and `rev` so you can animate as text firmes up
- Whitespace-aware: it inserts spacer nodes where needed so inline citations can sit tight against words

Because blocks are not parsed, teach the LLM to emit UI components for headings/lists and use Magic Text **only for inline runs** inside those components.

---

## 2) Drop-in renderer with custom links + citations

Start with a thin wrapper around `hb-magic-text` to keep styling and navigation rules in one place.

<hb-code-example header="magic-text-renderer.component.ts">

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  MagicText,
  MagicTextCitation,
  MagicTextRenderLink,
  MagicTextRenderCitation,
} from '@hashbrownai/angular';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-magic-text-renderer',
  standalone: true,
  imports: [
    MagicText,
    MagicTextRenderLink,
    MagicTextRenderCitation,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hb-magic-text
      class="magic-text"
      [text]="text()"
      [citations]="citations()"
      [defaultLinkTarget]="defaultLinkTarget"
      [defaultLinkRel]="defaultLinkRel"
      (linkClick)="onLinkClick($event)"
      (citationClick)="onCitationClick($event)"
    >
      <ng-template hbMagicTextRenderLink let-node>
        @if (node.href.startsWith('/')) {
          <a
            class="fragment-link"
            [routerLink]="node.href"
            [attr.title]="node.title || null"
            [attr.aria-label]="node.ariaLabel || null"
            [attr.rel]="node.rel || defaultLinkRel"
            [attr.target]="node.target || defaultLinkTarget"
            data-allow-navigation="true"
          >
            {{ node.text }}
          </a>
        } @else {
          <a
            class="fragment-link"
            [href]="node.href"
            [attr.title]="node.title || null"
            [attr.aria-label]="node.ariaLabel || null"
            [attr.rel]="node.rel || defaultLinkRel"
            [attr.target]="node.target || defaultLinkTarget"
            data-allow-navigation="true"
          >
            {{ node.text }}
          </a>
        }
      </ng-template>

      <ng-template hbMagicTextRenderCitation let-node>
        @if (node.citation.url) {
          <a
            class="citation"
            role="doc-noteref"
            data-allow-navigation="true"
            [href]="node.citation.url"
            [attr.rel]="defaultLinkRel"
            [attr.target]="defaultLinkTarget"
            [attr.title]="node.text"
            [attr.aria-label]="node.text"
          >
            <span class="icon">❖</span>
            <span class="sr-only">{{ node.text }}</span>
          </a>
        } @else {
          <button
            type="button"
            class="citation citation--placeholder"
            role="doc-noteref"
            [attr.aria-label]="node.text"
          >
            <span class="citation-placeholder"></span>
            <span class="sr-only">{{ node.text }}</span>
          </button>
        }
      </ng-template>
    </hb-magic-text>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .fragment-link {
        color: var(--sunshine-yellow-dark, #f2c94c);
      }

      .citation {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.85em;
      }

      .citation--placeholder {
        border: none;
        background: transparent;
        padding: 0;
        color: var(--sunshine-yellow-dark, #f2c94c);
        cursor: pointer;
      }

      .citation-placeholder {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.4);
        opacity: 0.5;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }

      hb-magic-text .hb-text--strong {
        font-weight: 600;
      }
    `,
  ],
})
export class MagicTextRenderer {
  readonly text = input.required<string>();
  readonly citations = input<MagicTextCitation[]>([]);
  protected readonly defaultLinkTarget = '_blank';
  protected readonly defaultLinkRel = 'noopener noreferrer';

  protected onLinkClick(event: unknown) {
    // Optional: forward to telemetry/analytics or intercept navigation.
  }

  protected onCitationClick(event: unknown) {
    // Optional: open side panel, track clicks, etc.
  }
}
```

</hb-code-example>

`hb-magic-text` exposes content slots so you can replace how text, links, citations, or whitespace render without forking the component. It already provides `defaultLinkTarget` and `defaultLinkRel` inputs (defaults `_blank` / `noopener noreferrer`); override them instead of hard-coding values if you need `_self` navigation. Keep `ChangeDetectionStrategy.OnPush` to align with signals-based Angular best practices; if you switch `ViewEncapsulation` off, be mindful of leaking styles to the rest of the app (the snippet uses the default encapsulation).

---

## 3) Feeding citations

Magic Text emits citation fragments when it sees `[^id]` in the text. Map them to URLs with the `citations` input:

<hb-code-example header="chat-message.component.ts (excerpt)">

```ts
import { Component, input } from '@angular/core';
import { MagicTextCitation } from '@hashbrownai/angular';
import { MagicTextRenderer } from './magic-text-renderer.component';

export interface ChatMessageViewModel {
  text: string;
  citations: MagicTextCitation[]; // { id: 'wiki', url: 'https://en.wikipedia.org/...' }
}

@Component({
  selector: 'app-chat-message',
  standalone: true,
  imports: [MagicTextRenderer],
  template: `
    <div class="bubble ai">
      <app-magic-text-renderer
        [text]="message().text"
        [citations]="message().citations"
      />
    </div>
  `,
})
export class ChatMessageComponent {
  readonly message = input.required<ChatMessageViewModel>();
}
```

</hb-code-example>

If a citation ID is missing from the lookup, the renderer shows a placeholder button so you can attach a click handler or toast.

---

## 4) Pairing Magic Text with UI chat blocks

Because Magic Text is inline-only, let the LLM generate **blocks as components** and place Magic Text inside them. A minimal block palette could be:

- `AppHeading` (renders `h2`)
- `AppBulletList` (wraps list items)
- `AppInfoCard` (for key-value summaries)
- `AppMagicText` (the renderer above)

Expose them to the LLM in your UI chat resource:

<hb-code-example header="chat.resource.ts (prompt excerpt)">

```ts
const systemPrompt = `
You render replies using these components:
- Heading({ text }): use for titles (no Markdown headings)
- BulletList({ items }): each item is plain text
- InfoCard({ title, items }): show short key/value pairs
- MagicText({ text, citations? }): inline Markdown only (no lists/paras)

Rules:
- Do not emit Markdown block syntax (no lists, headings, paragraphs).
- Use MagicText for inline emphasis, code, links, and citations.
- For citations, insert [^id] in text and also return citations[] with { id, url }.
`;
```

</hb-code-example>

Render the blocks in Angular, passing inline strings through Magic Text:

<hb-code-example header="chat-message.blocks.ts">

```ts
import { Component, input } from '@angular/core';
import { MagicTextRenderer } from './magic-text-renderer.component';

@Component({
  selector: 'app-heading-block',
  standalone: true,
  template: `<h2 class="block-heading">{{ text() }}</h2>`,
})
export class HeadingBlock {
  readonly text = input.required<string>();
}

@Component({
  selector: 'app-bullet-list-block',
  standalone: true,
  template: `
    <ul class="block-list">
      @for (item of items(); track $index) {
        <li><app-magic-text-renderer [text]="item" /></li>
      }
    </ul>
  `,
  imports: [MagicTextRenderer],
})
export class BulletListBlock {
  readonly items = input.required<string[]>();
}
```

</hb-code-example>

Now each message can be a mix of blocks, but every inline run is parsed and safely rendered by Magic Text.

---

## 5) Prompting the LLM for good Magic Text

Use these constraints in your system/developer messages:

- Inline only: "Use inline Markdown for bold/italic/code/links/citations. Do not output lists, paragraphs, or headings in Markdown."
- Citations: "Insert `[^id]` where support statements need sources. Return `citations: [{ id, url }]` alongside the text."
- Links: "Only `http/https/mailto/tel` links are allowed."
- Tight citations: "Place `[^id]` immediately after the fact without extra spaces."
- Streaming friendly: "Send text in short chunks; avoid rewriting earlier text unless necessary."

These prompts keep generated output aligned with what the renderer can parse.

---

## 6) Replacing render nodes (text, links, citations, whitespace)

`hb-magic-text` exposes four templates:

- `hbMagicTextRenderText`
- `hbMagicTextRenderLink`
- `hbMagicTextRenderCitation`
- `hbMagicTextRenderWhitespace`

Example: add enter animation and inline copy button for code spans.

<hb-code-example header="magic-text-override.component.ts (snippet)">

```ts
<hb-magic-text [text]="text()" [citations]="citations()">
  <ng-template hbMagicTextRenderText let-node>
    <span
      class="frag"
      [class.frag--code]="node.isCode"
      [attr.data-state]="node.state"
    >
      {{ node.text }}
      @if (node.isCode) {
        <button type="button" (click)="copy(node.text)">Copy</button>
      }
    </span>
  </ng-template>

  <ng-template hbMagicTextRenderWhitespace let-position="position" let-render>
    @if (render) {
      <span class="space" [class.space--before]="position === 'before'"> </span>
    }
  </ng-template>
</hb-magic-text>
```

</hb-code-example>

Replacing templates lets you add badges, counters, or custom spacing rules without touching the parser.

---

## 7) Lightweight animation for streaming chunks

Each fragment carries `data-fragment-state="provisional|final"` and the component applies `animate.enter="hb-text--enter"` by default. To keep it lightweight:

- Use CSS transitions keyed off `data-fragment-state`
- Avoid layout-thrashing JS; rely on opacity/transform

<hb-code-example header="magic-text.animations.css">

```css
hb-magic-text .hb-fragment[data-fragment-state='provisional'] {
  opacity: 0.6;
}

hb-magic-text .hb-fragment[data-fragment-state='final'] {
  transition: opacity 160ms ease, filter 160ms ease;
  opacity: 1;
}

hb-magic-text .hb-text--enter {
  animation: fade-in 220ms ease-out;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

</hb-code-example>

This matches the finance sample approach but keeps the payload tiny.

---

## 8) Troubleshooting and limits

- If block Markdown shows up in output, tighten your prompts and remind the model to use components for blocks.
- If citations render as placeholders, ensure every `[^id]` has a matching `{ id, url }`.
- Links without allowed protocols are dropped; double-check model prompts.
- Extra spaces around citations? The renderer strips gaps before/after citation fragments, but custom whitespace templates can reintroduce them—mirror the default logic if you override spacing.

Magic Text keeps inline content safe, styled, and stream-friendly. Pair it with a small set of trusted UI blocks, and you get rich conversational UIs without giving the LLM free-form HTML.
