---
title: 'Magic Text in React: Streaming Markdown'
meta:
  - name: description
    content: 'Stream a Markdown reply in React, inspect a source citation, and handle cancellation and errors with Hashbrown Magic Text.'
---

# Magic Text in React

Let's generate a small packing list and format it while the reply arrives. We'll render a heading, bold text, and a list, then open the source details when we select a citation.

<hb-docs-demo demo="magic-text">
</hb-docs-demo>

The recording uses scripted output through the real clients, with no live model. It adds presentation styling to the checked example. The reply and selected source live in component state; refreshing clears them.

<img src="/video/docs/magic-text-result.png" alt="A generated packing list with its source details open" width="920" height="720" loading="lazy" />

## Before we start

Complete the [React Quickstart](/docs/react/start/quick), including its local server and `/api/chat` endpoint. For live requests, set `OPENAI_API_KEY` and `OPENAI_MODEL` on that server. Keep the API key out of browser code.

We'll use two checked files under `www/examples/quickstart`: `runtime/magic-text.ts` and `react/src/MagicTextDemo.tsx`. Keep that directory layout so the shared helper import resolves. No additional package is needed.

## Generate and inspect a reply

1. Copy the complete shared helper and React component below into the Quickstart example.
2. Import `MagicTextDemo` into `react/src/App.tsx` and render `<MagicTextDemo />`. Keep the `HashbrownProvider` in `react/src/main.tsx`; it supplies `/api/chat` to `useChat`.
3. Start the Quickstart server and client, then select **Generate reply**.
4. Watch the heading, emphasis, and list appear as the assistant string grows. When the source definition arrives, select the numbered citation to open **Source details**.
5. Select **Generate reply** again. The example replaces the conversation with a fresh user message and clears the selected source. Select **Cancel** during a reply to stop it, then generate again to start a new request.

`useChat` owns the request. `MagicTextRenderer` receives the latest assistant string and renders the Markdown as it grows. The example includes `isSending` in its busy check so the send debounce window counts as part of the request.

The citation uses `[^docs]` in the reply and `[^docs]: Hashbrown docs https://hashbrown.dev` for its definition. A marker without a usable source URL is unresolved; it cannot open source details yet. Once the URL is available, our click handler prevents navigation and displays the reference inside the page.

We supply the documentation URL in the prompt. The citation does not verify the packing advice, confirm that the model consulted the page, or prove the answer is correct.

## Know when the stream ended

`isComplete` finalizes Markdown parsing when the stream ends. It does not mean the answer succeeded. The example finalizes the partial text after a normal finish, cancellation, or an error, and reports the outcome separately:

- **Reply complete.** The run ended without a reported error or early finish reason. Review the answer before using it.
- **Reply ended early. Generate another reply.** The provider reported a finish reason such as a token limit or refusal.
- **Stopped. Generate another reply to start again.** We cancelled the request; any partial text remains visible.
- **Request failed. Generate another reply to try again.** The request failed, and the page offers a fresh generation.

## Complete example

The helper keeps the prompt and status rules shared between frameworks. The component uses the Quickstart's existing endpoint configuration.

<hb-expander title="Complete runtime/magic-text.ts">
<hb-code-example header="runtime/magic-text.ts">

```ts
import { type FinishReason } from '@hashbrownai/core';

/** Instructions for a bounded Markdown reply with an explicitly supplied source. */
export const magicTextSystem =
  'Write a short packing reply in Markdown with a level-two heading, bold emphasis, and a two-item list. End with See setup details[^docs]. Use only this source definition: [^docs]: Hashbrown docs https://hashbrown.dev. A citation is a source reference, not proof that the reply is correct.';

/** Returns the latest assistant string without falling back to an earlier reply. */
export function latestAssistantText(
  messages: readonly { role: string; content?: unknown }[],
): string {
  const message = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  return typeof message?.content === 'string' ? message.content : '';
}

/** Separates parser finalization from the outcome of an explicitly started run. */
export function magicTextState(input: {
  started: boolean;
  stopped: boolean;
  error: unknown;
  finishReason?: FinishReason;
  isLoading: boolean;
  isSending: boolean;
  isReceiving: boolean;
  isGenerating: boolean;
}): { busy: boolean; isComplete: boolean; status: string } {
  const busy =
    input.isLoading ||
    input.isSending ||
    input.isReceiving ||
    input.isGenerating;
  const status = busy
    ? 'Generating reply…'
    : input.error
      ? 'Request failed. Generate another reply to try again.'
      : input.stopped
        ? 'Stopped. Generate another reply to start again.'
        : input.finishReason && input.finishReason !== 'stop'
          ? 'Reply ended early. Generate another reply.'
          : input.started
            ? 'Reply complete.'
            : 'Ready';

  return { busy, isComplete: !busy, status };
}
```

</hb-code-example>
</hb-expander>

<hb-expander title="Complete react/src/MagicTextDemo.tsx">
<hb-code-example header="react/src/MagicTextDemo.tsx">

```tsx
import { useState } from 'react';
import {
  type MagicTextCitationRenderData,
  MagicTextRenderer,
  useChat,
} from '@hashbrownai/react';
import {
  latestAssistantText,
  magicTextState,
  magicTextSystem,
} from '../../runtime/magic-text';

/** Streams a fresh Markdown reply and opens source details without navigation. */
export function MagicTextDemo() {
  const [started, setStarted] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [citation, setCitation] = useState<MagicTextCitationRenderData | null>(
    null,
  );
  const chat = useChat({ system: magicTextSystem, debugName: 'magic-text' });
  const state = magicTextState({
    started,
    stopped,
    error: chat.error,
    finishReason: chat.lastRunFinishReason,
    isLoading: chat.isLoading,
    isSending: chat.isSending,
    isReceiving: chat.isReceiving,
    isGenerating: chat.isGenerating,
  });
  const text = latestAssistantText(chat.messages);

  return (
    <main>
      <h1>Magic Text</h1>
      <p>
        Generate a packing reply, then select its citation to inspect the
        source.
      </p>
      <nav aria-label="Reply actions">
        <button
          type="button"
          disabled={state.busy}
          onClick={() => {
            setStarted(true);
            setStopped(false);
            setCitation(null);
            chat.setMessages([
              {
                id: crypto.randomUUID(),
                role: 'user',
                content:
                  'Write a small packing list with a passport and charger, and cite the supplied setup documentation.',
              },
            ]);
          }}
        >
          Generate reply
        </button>
        <button
          type="button"
          disabled={!state.busy}
          onClick={() => {
            setStopped(true);
            chat.stop();
          }}
        >
          Cancel
        </button>
      </nav>
      <p role="status">{state.status}</p>
      {chat.error && (
        <p role="alert">Check your server, then generate another reply.</p>
      )}
      <section aria-label="Generated reply" aria-busy={state.busy}>
        <MagicTextRenderer
          isComplete={state.isComplete}
          caret={state.busy}
          onCitationClick={(event, selected) => {
            event.preventDefault();
            setCitation(selected);
          }}
        >
          {text}
        </MagicTextRenderer>
      </section>
      <p>
        Source markers without a source URL are unresolved and cannot open
        details yet.
      </p>
      {citation && (
        <aside aria-label="Source details">
          <h2>Source {citation.number}</h2>
          <p>
            {citation.id === 'docs'
              ? 'Hashbrown docs'
              : `Reference ${citation.id}`}
          </p>
          <p>{citation.url ?? 'Source URL unavailable.'}</p>
          <p>
            This citation is a model-provided reference. It does not verify the
            reply.
          </p>
          <button type="button" onClick={() => setCitation(null)}>
            Close source details
          </button>
        </aside>
      )}
      <p>
        When the stream ends, isComplete finalizes Markdown parsing, including
        after cancellation or an error.
      </p>
    </main>
  );
}
```

</hb-code-example>
</hb-expander>

## If the reply does not appear

Check that the Quickstart server is running and that the browser can reach `/api/chat`. For a live request, check the server's model and API key configuration. The page reports request errors; after fixing the server, select **Generate reply** to retry with a fresh message.

If you cancelled, select **Generate reply** to start again. If a citation is still unresolved, wait for its definition. A cancelled or incomplete response may never supply one. Selecting a new generation also clears details from the previous response.

The default renderer handles Markdown nodes rather than injecting model text as HTML, and sanitizes link URLs. Custom renderers own their rendering behavior; review those changes before using untrusted output.

## Next steps

Use `segmenter` to control text segmentation and `nodeRenderers` when a Markdown node needs your application’s styling. The [renderer props](/api/react/MagicTextRendererProps) and [renderer helper](/api/react/createMagicTextNodeRenderers) describe the supported options.

When a model should place Markdown inside generated UI, use [exposeMarkdown](/api/react/exposeMarkdown) with your UI kit. This example stays with text chat so we can see the assistant string and request lifecycle directly.

For direct parser work, see the [v0.6 parser guidance](/docs/react/migrations/v0-6#magic-text-and-json-parser-internals). The streaming Markdown parser comes from `@cacheplane/partial-markdown`; parsing internals are separate from the renderer's public API.
