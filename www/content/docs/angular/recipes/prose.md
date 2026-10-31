---
title: 'Prose in Angular: Streaming Markdown'
meta:
  - name: description
    content: 'Render streamed assistant Markdown, handle completion and citations, then inspect the recorded workbench conversation.'
---

# Prose in Angular

Streaming Markdown turns a growing assistant string into readable headings, lists, links, and citations. Use it when the answer is prose and the reader benefits from seeing it before the request finishes. The conversation API owns messages and cancellation; the renderer owns formatting.

Let’s build a help panel that explains a returns policy. We will render the original assistant text as it grows, and finish parsing when the request stops, including a stopped or failed partial answer.

<hb-diagram diagram="recipe-markdown-finalization"> </hb-diagram>

## Render a help reply

Start with the [Angular Quickstart](/docs/angular/start/quick). The following frontend example uses its configured Hashbrown provider and same-origin `/api/chat` endpoint. Keep the provider key and model configuration on the server. Create resources in an Angular injection context; the component below supplies one.

```ts
import { Component } from '@angular/core';
import { chatResource, Prose } from '@hashbrownai/angular';

@Component({
  selector: 'app-returns-help',
  imports: [Prose],
  template: `
    <button [disabled]="chat.isLoading()" (click)="explain()">
      Explain the policy
    </button>
    @if (chat.error()) {
      <p role="alert">The reply could not finish. Try again.</p>
    } @else {
      @for (message of chat.value(); track $index) {
        @if (
          message.role === 'assistant' && typeof message.content === 'string'
        ) {
          <hb-prose
            [text]="message.content"
            [isComplete]="!chat.isLoading()"
          />
        }
      }
    }
    <button [disabled]="!chat.isLoading()" (click)="chat.stop()">Stop</button>
  `,
})
export class ReturnsHelp {
  readonly chat = chatResource({
    system:
      'Explain this public returns policy in Markdown: unused items may be returned within 30 days with a receipt.',
  });
  explain() {
    this.chat.sendMessage({
      role: 'user',
      content: 'What do I need to return an item?',
    });
  }
}
```

The fixed prompt keeps this screen small. Replace it with a labelled composer for an open conversation. `isComplete` finalizes Markdown parsing; it does not report request success. Keep failure and cancellation visible separately. If you add citations, use the renderer’s citation event and resolved URL rather than guessing references from the source string. A rendered citation does not prove retrieval or factual accuracy.

## Explore it in the workbench

The workbench below replays a recorded run of this lesson.

<hb-workbench lesson="prose">
</hb-workbench>

I want to read a reply while it arrives. Let's explain the same two-step plan in Markdown, follow its source reference, and ask for a shorter explanation.

`chatResource` owns the conversation. `Prose` formats the assistant string as it grows. This is text chat: the model is not generating component props.

## Run the workbench

Use the panel above, or [run the workbench on your machine](/docs/angular/start/workbench#run-the-example). The **Markdown** inspector opens first. Its endpoint is `/api/workbench/prose`.

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

The checked client connects the lesson to the real SDK:

<hb-code-example header="angular/src/app/prose-workbench.ts" moment="parsed-text-1">

```html
<hb-prose
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

- [Framework client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/prose-workbench.ts).
- [Shared recipe contracts](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-recipes.ts).
- [Renderer API](/api/angular/Prose) and [exposeMarkdown](/api/angular/exposeMarkdown).

For the next minor release, see the [prose rename guide](/docs/angular/migrations/prose). For older parser integrations, see [v0.6 parser migration notes](/docs/angular/migrations/v0-6#prose-and-json-parser-internals). Continue with [Streaming](/docs/angular/concept/streaming) for typed props and [Debugging](/docs/angular/concept/debugging) for request failures.
