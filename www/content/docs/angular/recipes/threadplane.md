---
title: 'Threadplane Chat: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Connect Threadplane Angular chat to an existing Hashbrown AG-UI server with provideAgent, injectAgent, and ChatComponent.'
---

# Chat with Threadplane

Let's use Threadplane for the chat screen and keep Hashbrown on the server. Threadplane's AG-UI adapter will send the conversation to our existing `/api/chat` endpoint and render the streamed response through `<chat>`.

We'll start with text messages. If you're replacing an existing `chatResource` screen, follow the [migration checklist](/docs/angular/migrations/threadplane) before removing its tools or saved history.

## Before we start

Start with an Angular 20–22 application and the [Quickstart server](/docs/angular/start/quick). Hashbrown's text adapter accepts the standard AG-UI run input and streams AG-UI events, which Threadplane's adapter can consume.

Keep the provider API key and model on the server. Continue using the same-origin `/api/chat` path and the Quickstart development proxy to `http://127.0.0.1:3001`.

This frontend will use Threadplane's AG-UI runtime. It doesn't create a Hashbrown `chatResource`. Other parts of the application can keep using Hashbrown resources independently.

## Install the chat and AG-UI adapter

In your Angular frontend project, install:

```sh
npm install @threadplane/chat @threadplane/ag-ui @ag-ui/client @ag-ui/core marked
```

`marked` is the chat renderer's Markdown parser peer. Keep the Threadplane packages on matching versions and satisfy the peer dependencies reported by npm. This example follows the [Threadplane AG-UI adapter](https://github.com/cacheplane/threadplane/tree/2c7f01fa958441f3ed94e2559987217be284e94a/libs/ag-ui) and [chat composition](https://github.com/cacheplane/threadplane/tree/2c7f01fa958441f3ed94e2559987217be284e94a/libs/chat) APIs.

Add a theme to your global stylesheet:

<hb-code-example header="src/styles.css">

```css
@import '@threadplane/chat/themes/default-light.css';
```

</hb-code-example>

## Create the chat screen

Create `src/app/threadplane-chat.ts`. `provideAgent` creates an AG-UI HTTP agent for `/api/chat`; `injectAgent` returns that agent to the component. `ChatComponent` supplies the transcript, composer, and active-run controls.

<hb-expander title="Complete src/app/threadplane-chat.ts">

<hb-code-example header="src/app/threadplane-chat.ts">

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { injectAgent, provideAgent } from '@threadplane/ag-ui';
import { ChatComponent } from '@threadplane/chat';

/** Hosts a Threadplane conversation backed by the Hashbrown server. */
@Component({
  selector: 'app-threadplane-chat',
  imports: [ChatComponent],
  providers: [provideAgent({ url: '/api/chat' })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Ask a product question</h1>
      <chat [agent]="agent" />
    </main>
  `,
  styles: `
    :host {
      display: block;
    }
    chat {
      display: block;
      height: min(42rem, 85dvh);
    }
  `,
})
export class ThreadplaneChat {
  protected readonly agent = injectAgent();
}
```

</hb-code-example>

</hb-expander>

The component-scoped provider gives this screen its own agent. The adapter registers cleanup with that injector's `DestroyRef`; leaving the screen disposes the agent. Move the provider to a longer-lived injector only when that longer conversation lifetime is intentional. Don't create a second agent for the same visible conversation.

## Mount the screen

Bootstrap the component in `src/main.ts`:

<hb-code-example header="src/main.ts">

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { ThreadplaneChat } from './app/threadplane-chat';

bootstrapApplication(ThreadplaneChat).catch((error: unknown) => {
  console.error(error);
});
```

</hb-code-example>

Replace the root element in `src/index.html` with:

```html
<app-threadplane-chat></app-threadplane-chat>
```

Keep the existing `/api` proxy. Start the Quickstart server and run your Angular development server with that proxy configuration. This standalone screen doesn't need `provideHashbrown`; retain that provider if other mounted components still use Hashbrown resources.

## Try the conversation

Send **Where can I find shipping information?** You should see the message and a streamed reply. Send a follow-up and confirm that the same conversation is sent to the existing server. Use the chat's stop control during a response, then explicitly send again when you're ready.

No request is required to display an empty chat. A failed run is displayed through the adapter's error state. Check the frontend proxy, server process, and provider configuration before sending another message.

## Keep policy on the server

The `system` value previously passed to `chatResource` doesn't move into `provideAgent`. If those instructions still matter, put trusted instructions and context in the server's request handling before enabling the new screen. See [server request customization](/docs/angular/concept/transform-request-options).

The AG-UI adapter changes how the browser talks to the endpoint. Authentication, authorization, thread ownership, request limits, and provider credentials remain application responsibilities. Use the [public endpoint pattern](/docs/angular/recipes/public-endpoint) before connecting real customer data. A message or state value supplied by the browser can't establish the caller's identity or permission.

The chat can display capabilities the backend emits. Replacing the UI doesn't translate a Hashbrown component registry, browser tool handler, structured-output schema, or saved thread store into Threadplane configuration.

## Next steps

Use [Migrate chat presentation to Threadplane](/docs/angular/migrations/threadplane) for an existing app. Review [Message history](/docs/angular/concept/message-history) before restoring conversations, and Threadplane's [AG-UI documentation](https://threadplane.ai/docs/ag-ui/getting-started/quickstart) for adapter-specific configuration.
