---
title: 'Magic Text in React: Streaming Markdown'
meta:
  - name: description
    content: 'Use Hashbrown Magic Text in React for optimistic streaming Markdown rendering, citations, custom renderers, and exposeMarkdown().'
---

# Magic Text in React

Magic Text is Hashbrown's optimistic Markdown parser and renderer for streaming LLM output. It renders partial Markdown while text is still arriving, then converges to the final structure when the stream completes.

Use it when you want:

- Stable streaming Markdown without handing arbitrary HTML to the browser.
- Inline citations that can be rendered as trusted UI.
- Per-node renderer overrides for your design system.
- Segment-level rendering for animation.
- A renderer you can expose to generative UI with `exposeMarkdown()`.

---

## 1. Render Streaming Markdown

`MagicTextRenderer` renders Markdown from a string. Set `isComplete` when the model is done so open Markdown constructs can finalize.

<hb-code-example header="AssistantMarkdown.tsx">

```tsx
import { MagicTextRenderer } from '@hashbrownai/react';

export function AssistantMarkdown({
  text,
  isComplete,
}: {
  text: string;
  isComplete: boolean;
}) {
  return (
    <MagicTextRenderer
      isComplete={isComplete}
      caret
      options={{ segmenter: { granularity: 'word' } }}
    >
      {text}
    </MagicTextRenderer>
  );
}
```

</hb-code-example>

`caret` shows a streaming cursor while the deepest open node is still incomplete. `options.segmenter` controls how text nodes are split for rendering and animation.

---

## 2. Handle Links and Citations

Magic Text supports normal Markdown links and citation references:

- Inline reference: `[^source-id]`
- Definition: `[^source-id]: Source title https://example.com`

<hb-code-example header="AssistantMarkdown.tsx">

```tsx
import { MagicTextRenderer } from '@hashbrownai/react';

export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <MagicTextRenderer
      isComplete
      onLinkClick={(event, url) => {
        if (url.startsWith('http')) {
          return;
        }

        event.preventDefault();
      }}
      onCitationClick={(_event, citation) => {
        console.log('citation selected', citation);
      }}
    >
      {text}
    </MagicTextRenderer>
  );
}
```

</hb-code-example>

Give the model a prompt pattern like this when you want citations:

<hb-code-example header="system prompt excerpt">

```txt
Write in Markdown.

When you make a factual claim that needs a source, add an inline citation like [^id].
At the end, add a definition line for each citation:
[^id]: Short source title https://full-url

Do not invent URLs. Omit citations if you are unsure.
```

</hb-code-example>

---

## 3. Customize Node Rendering

Use `nodeRenderers` when Markdown should match your product UI. The `node` renderer is a fallback for every node type that does not have a specific override.

<hb-code-example header="AssistantMarkdown.tsx">

```tsx
import {
  MagicTextRenderer,
  createMagicTextNodeRenderers,
} from '@hashbrownai/react';

const nodeRenderers = createMagicTextNodeRenderers({
  heading: ({ node, children }) => {
    const Heading = `h${node.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

    return <Heading className="assistant-heading">{children}</Heading>;
  },
  citation: ({ citation }) => (
    <sup className="assistant-citation">
      {citation?.number ? `[${citation.number}]` : '[?]'}
    </sup>
  ),
  node: ({ defaultNode }) => defaultNode,
});

export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <MagicTextRenderer isComplete nodeRenderers={nodeRenderers}>
      {text}
    </MagicTextRenderer>
  );
}
```

</hb-code-example>

---

## 4. Expose Markdown to Generative UI

Use `exposeMarkdown()` when the model should generate Markdown inside a trusted component instead of generating arbitrary HTML.

<hb-code-example header="ui-kit.tsx">

```tsx
import { exposeMarkdown, useUiKit } from '@hashbrownai/react';

export function useAssistantUiKit() {
  return useUiKit({
    components: [
      exposeMarkdown({
        name: 'Markdown',
        description: 'Render Markdown content for the user.',
        citations: true,
        options: { segmenter: { granularity: 'word' } },
        caret: true,
        className: 'assistant-markdown',
      }),
    ],
  });
}
```

</hb-code-example>

Pass the UI kit to `useUiChat()` or `useUiCompletion()`:

<hb-code-example header="Assistant.tsx">

```tsx
import { useUiChat } from '@hashbrownai/react';
import { useAssistantUiKit } from './ui-kit';

export function Assistant() {
  const uiKit = useAssistantUiKit();
  const { messages, sendMessage } = useUiChat({
    model: 'gpt-5',
    components: [uiKit],
  });

  return (
    <ChatView
      messages={messages}
      onSubmit={(message) => sendMessage(message)}
    />
  );
}
```

</hb-code-example>

---

## 5. Use the Parser Directly

If you need the Magic Text AST instead of React elements, use the parser helpers from `@hashbrownai/core`.

<hb-code-example header="parse.ts">

```ts
import {
  createMagicTextParserState,
  finalizeMagicText,
  parseMagicTextChunk,
} from '@hashbrownai/core';

let state = createMagicTextParserState({
  segmenter: { granularity: 'word' },
});

state = parseMagicTextChunk(state, 'Hello **wor');
state = parseMagicTextChunk(
  state,
  'ld** [^docs]\n\n[^docs]: Docs https://hashbrown.dev',
);
state = finalizeMagicText(state);
```

</hb-code-example>

The parser state includes the Markdown AST, citation metadata, warnings, and completion state.
