---
title: 'Prose in React: Streaming Markdown'
meta:
  - name: description
    content: 'Render streamed assistant Markdown, handle completion and citations, then inspect the recorded workbench conversation.'
---

# Prose in React

Streaming Markdown turns a growing assistant string into readable headings, lists, links, and citations. Use it when the answer is prose and the reader benefits from seeing it before the request finishes. The conversation API owns messages and cancellation; the renderer owns formatting.

Let’s build a help panel that explains a returns policy. We will render the original assistant text as it grows, and finish parsing when the request stops, including a stopped or failed partial answer.

<hb-diagram diagram="recipe-markdown-finalization"> </hb-diagram>

## Render a help reply

Start with the [React Quickstart](/docs/react/start/quick). The following frontend example uses its configured Hashbrown provider and same-origin `/api/chat` endpoint. Keep the provider key and model configuration on the server. Mount the component beneath `HashbrownProvider` and keep it mounted for the conversation lifetime.

```tsx
import { ProseRenderer, useChat } from '@hashbrownai/react';

export function ReturnsHelp() {
  const chat = useChat({
    system:
      'Explain this public returns policy in Markdown: unused items may be returned within 30 days with a receipt.',
  });
  return (
    <section aria-label="Returns help">
      <button
        disabled={chat.isLoading}
        onClick={() =>
          chat.sendMessage({
            role: 'user',
            content: 'What do I need to return an item?',
          })
        }
      >
        Explain the policy
      </button>
      {chat.messages.map((message) =>
        message.role === 'assistant' && typeof message.content === 'string' ? (
          <ProseRenderer key={message.id} isComplete={!chat.isLoading}>
            {message.content}
          </ProseRenderer>
        ) : null,
      )}
      {chat.error && <p role="alert">The reply could not finish. Try again.</p>}
      <button disabled={!chat.isLoading} onClick={() => chat.stop()}>
        Stop
      </button>
    </section>
  );
}
```

The fixed prompt keeps this screen small. Replace it with a labelled composer for an open conversation. `isComplete` finalizes Markdown parsing; it does not report request success. Keep failure and cancellation visible separately. If you add citations, use the renderer’s citation event and resolved URL rather than guessing references from the source string. A rendered citation does not prove retrieval or factual accuracy.

## Explore it in the workbench

The workbench below replays a recorded run of this lesson.

<hb-workbench lesson="prose">
</hb-workbench>

I want to read a reply while it arrives. Let's explain the same two-step plan in Markdown, follow its source reference, and ask for a shorter explanation.

`useChat` owns the conversation. `ProseRenderer` formats the assistant string as it grows. This is text chat: the model is not generating component props.

## Run the workbench

Use the panel above, or [run the workbench on your machine](/docs/react/start/workbench#run-the-example). The **Markdown** inspector opens first. Its endpoint is `/api/workbench/prose`.

The application supplies a fixed plan. The model explains that plan; it does not replace its steps or apply an action.

## Follow the reply

1. Send **First prompt**. The browser's `readContext` tool supplies the current plan and revision.
2. Watch raw Markdown arrive in the inspector and formatting appear in the chat. The reply includes a heading, emphasis, a list, and a documentation footnote.
3. Select the numbered citation after its source URL resolves. The inspector's **Selected reference** section shows the reference the renderer selected. The workbench prevents navigation.
4. Send **Follow-up** to shorten the explanation in the same conversation. The plan stays at revision 0.
5. Use the bottom player to inspect either reply. Chat, Markdown, source details, and state follow the selected frame. Replay does not send requests or run tools.

## Give a reference a clear meaning

The example supplies this public source directly:

<hb-code-example header="runtime/workbench-recipes.ts">

```ts
export const workbenchMarkdownSource = 'https://hashbrown.dev';
```

</hb-code-example>

The citation does not verify the explanation or prove that the model retrieved the page. It demonstrates a reference rendered from the supplied Markdown. An unresolved marker has no usable source URL yet and cannot open source details.

The click handler records the renderer's actual citation ID, number, URL, and originating message. It does not guess references from the raw text. During replay, citation handlers cannot navigate or change live state.

## Finalize parsing separately from success

`isComplete` tells Prose that the current text has ended. It does not mean the answer succeeded. Finalize a stopped or failed partial reply too, and report the request outcome separately.

**Stop** cancels active work and keeps the partial explanation visible. A failed or early response does not change the plan. Check the request and terminal event, return to live, then submit an explicit retry. The workbench keeps an earlier error from settling the new request.

Turn on **Raw events** to see every captured chunk on the scrubber. Markdown streaming is labeled as text; the AG-UI transport still carries JSON event envelopes around those text chunks.

## Use the framework API

The shared text client also hosts the plain-text onboarding lessons. Prose uses `workbenchTextSystem` and `readContext`; its renderer handles the streamed Markdown:

<hb-code-example header="react/src/ProseWorkbench.tsx" moment="parsed-text-1">

```tsx
const chat = useChat({
  system:
    lesson.id === 'system-instructions'
      ? workbenchBrowserInstructions
      : plain
        ? workbenchConversationSystem
        : workbenchTextSystem,
  tools: plain ? [] : [readContext],
  transport,
});
```

</hb-code-example>

## Read the checked example

The [workbench guide](/docs/react/start/workbench) explains setup, conversation lifetime, and playback. The framework client uses the real SDK renderer for both live text and captured history.

- [Framework client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/ProseWorkbench.tsx).
- [Shared recipe contracts](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-recipes.ts).
- [Renderer API](/api/react/ProseRendererProps) and [exposeMarkdown](/api/react/exposeMarkdown).

For the next minor release, see the [prose rename guide](/docs/react/migrations/prose). For older parser integrations, see [v0.6 parser migration notes](/docs/react/migrations/v0-6#prose-and-json-parser-internals). Continue with [Streaming](/docs/react/concept/streaming) for typed props and [Debugging](/docs/react/concept/debugging) for request failures.
