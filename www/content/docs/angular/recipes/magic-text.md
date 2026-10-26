---
title: 'Magic Text in Angular: Streaming Markdown'
meta:
  - name: description
    content: 'Stream Markdown in the canonical plan workbench, inspect a citation, and replay the actual reply without another request.'
---

# Magic Text in Angular

<hb-docs-demo demo="canonical-workbench-magic-text-angular">
</hb-docs-demo>

I want to read a reply while it arrives. Let's explain the same two-step plan in Markdown, follow its source reference, and ask for a shorter explanation.

`chatResource` owns the conversation. `MagicText` formats the assistant string as it grows. This is text chat: the model is not generating component props.

## Run the workbench

Start the [conversation workbench](/docs/angular/start/workbench) with server-only `OPENAI_API_KEY` and `OPENAI_MODEL`:

```sh
npx nx workbench-serve www
```

Open `http://127.0.0.1:4370/angular.html?lesson=magic-text`. The **Markdown** inspector opens first. Selecting the lesson does not send a request. Its endpoint is `/api/workbench/magic-text`.

The application supplies a fixed plan. The model explains that plan; it does not replace its steps or apply an action.

## Follow the reply

1. Send **First prompt**. The browser's `readContext` tool supplies the current plan and revision.
2. Watch raw Markdown arrive in the inspector and formatting appear in the chat. The reply includes a heading, emphasis, a list, and a documentation footnote.
3. Select the numbered citation after its source URL resolves. The inspector's **Selected reference** section shows the reference the renderer selected. The workbench prevents navigation.
4. Send **Follow-up** to shorten the explanation in the same conversation. The plan stays at revision 0.
5. Use the bottom player to inspect either reply. Chat, Markdown, source details, and state follow the selected frame. Replay does not send requests or run tools.

<img src="/video/docs/canonical-workbench-magic-text-angular-result.png" alt="The Angular workbench shows a Markdown explanation of the two-step plan and its captured source details." width="1600" height="1000" loading="lazy" />

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

`isComplete` tells Magic Text that the current text has ended. It does not mean the answer succeeded. Finalize a stopped or failed partial reply too, and report the request outcome separately.

**Stop** cancels active work and keeps the partial explanation visible. A failed or early response does not change the plan. Check the request and terminal event, return to live, then submit an explicit retry. The workbench keeps an earlier error from settling the new request.

Turn on **Raw events** to see every captured chunk on the scrubber. Markdown streaming is labeled as text; the AG-UI transport still carries JSON event envelopes around those text chunks.

## Use the framework API

The checked client connects the lesson to the real SDK:

<hb-code-example header="angular/src/app/magic-text-workbench.ts">

```html
<hb-magic-text
  [text]="
                message.recipe?.kind === 'text'
                  ? message.recipe.markdown
                  : message.content
              "
  [isComplete]="complete(message.id)"
  [caret]="busy(message.id)"
  (linkClick)="$event.mouseEvent.preventDefault()"
  (citationClick)="inspect($event, message.id)"
/>
```

</hb-code-example>

## Read the checked example

The [workbench guide](/docs/angular/start/workbench) explains setup, conversation lifetime, and playback. The framework client uses the real SDK renderer for both live text and captured history.

- [Framework client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/magic-text-workbench.ts).
- [Shared recipe contracts](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-recipes.ts).
- [Renderer API](/api/angular/MagicText) and [exposeMarkdown](/api/angular/exposeMarkdown).

For older integrations, see [Magic Text migration notes](/docs/angular/migrations/v0-6#magic-text-and-json-parser-internals). Continue with [Streaming](/docs/angular/concept/streaming) for typed props and [Debugging](/docs/angular/concept/debugging) for request failures.
