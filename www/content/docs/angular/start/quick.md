---
title: 'Angular Quickstart: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Build your first generated UI with a trusted welcome card.'
---

# Angular Quickstart

Let's build a welcome card. We'll write the component, tell the model which props it accepts, and ask Hashbrown to render it.

<hb-docs-demo demo="welcome-card">
</hb-docs-demo>

<img src="/video/docs/welcome-card-result.png" alt="The completed WelcomeCard with a welcome title and a one-sentence message." width="920" height="304" loading="lazy" />

The model supplies the text. Our Angular component supplies the markup and behavior.

## Before we start

This example assumes an Angular 22 app using standalone components, Node.js 24, and an OpenAI API key. You'll also need the name of a model your account can use with structured output.

We'll run two processes: your frontend development server and a small Express server. The browser calls `/api/chat` on the frontend's origin; a development proxy forwards that request to Express on port 3001. Keep the API key on the server.

<a id="install"></a>

## Install Hashbrown

In your existing frontend project, install the client packages:

```sh
npm install @hashbrownai/core @hashbrownai/angular
```

Next, create a sibling directory for the server. Keep it outside the frontend's source directory:

```sh
cd ..
mkdir welcome-server
cd welcome-server
npm init -y
npm install @hashbrownai/core @hashbrownai/openai openai express @ag-ui/core @ag-ui/encoder
npm install --save-dev tsx typescript @types/express @types/node
```

Create a `.env` file in `welcome-server`. Replace both values with your own settings, and add `.env` to `.gitignore`:

```sh
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=your-model-name
```

## Create the server endpoint

Create `server.ts` in `welcome-server`:

<hb-code-example header="server.ts">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import express from 'express';

const apiKey = process.env['OPENAI_API_KEY'];
const model = process.env['OPENAI_MODEL'];
if (!apiKey || !model)
  throw new Error('Set OPENAI_API_KEY and OPENAI_MODEL in .env');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/api/chat', async (req, res) => {
  const controller = new AbortController();
  res.once('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const encoder = new EventEncoder();
  res.setHeader('Content-Type', encoder.getContentType());
  res.setHeader('Cache-Control', 'no-cache, no-store');

  try {
    const stream = HashbrownOpenAI.stream.text({
      apiKey,
      model,
      input: req.body as RunAgentInput,
      signal: controller.signal,
    });
    for await (const event of stream) {
      if (controller.signal.aborted) break;
      res.write(encoder.encodeSSE(event));
    }
    res.end();
  } catch {
    if (!res.headersSent) res.status(500).end('Could not start the response');
    else res.destroy();
  }
});

app.listen(3001, '127.0.0.1', () => {
  console.log('Hashbrown endpoint: http://127.0.0.1:3001/api/chat');
});
```

</hb-code-example>

The adapter turns the model's response into AG-UI events. `EventEncoder` writes those events as a server-sent event stream that Hashbrown can read. If the browser disconnects, we cancel the provider request.

Run the endpoint in one terminal:

```sh
npx tsx --env-file=.env server.ts
```

This server listens on your machine's loopback address for local development. Before publishing an endpoint, add request validation, authentication, authorization, and usage limits. See [Securing a public endpoint](/docs/angular/recipes/public-endpoint).

## Write the welcome card

Back in the frontend project, create the component:

<hb-code-example header="src/app/welcome-card.ts">

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A developer-owned card whose text can be supplied by the model. */
@Component({
  selector: 'app-welcome-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article aria-label="Welcome card">
      <h2>{{ title() }}</h2>
      <p>{{ message() }}</p>
    </article>
  `,
})
export class WelcomeCard {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
}
```

</hb-code-example>

We have two strings: `title` and `message`. The component renders them as ordinary text, using the same framework bindings as the rest of our app.

## Expose the component

The @hashbrownai/angular!uiChatResource:function function creates the UI conversation.

Replace your root component with the following example:

<hb-code-example header="src/app/app.ts">

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { s } from '@hashbrownai/core';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { WelcomeCard } from './welcome-card';

const components = [
  exposeComponent(WelcomeCard, {
    name: 'WelcomeCard',
    description: 'Welcome a developer with a title and a short message.',
    input: {
      title: s.string('A short welcome title'),
      message: s.string('A one-sentence welcome message'),
    },
    children: false,
  }),
];

/** Generates a welcome card from the components we expose. */
@Component({
  selector: 'app-root',
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Your first generated UI</h1>
      <button type="button" [disabled]="chat.isLoading()" (click)="generate()">
        Generate a welcome card
      </button>
      @if (chat.isLoading()) {
        <p role="status">Creating your card...</p>
      }
      @if (chat.error()) {
        <p role="alert">
          We could not create the card. Check your server, then try again.
        </p>
      } @else {
        @for (message of chat.value(); track $index) {
          @if (message.role === 'assistant') {
            <hb-render-message [message]="message" />
          }
        }
      }
    </main>
  `,
})
export class App {
  protected readonly chat = uiChatResource({
    system: 'Welcome developers to Hashbrown. Render one WelcomeCard.',
    components,
  });

  protected generate(): void {
    this.chat.sendMessage({
      role: 'user',
      content:
        'Welcome a developer to Hashbrown. Render a WelcomeCard with a short title and a one-sentence message.',
    });
  }
}
```

</hb-code-example>

Let's break this down:

1. `exposeComponent()` gives the model a name, a description, and a schema for the card's inputs.
2. `s.string()` describes the text the component accepts. Hashbrown validates the generated values before passing them to the component.
3. `uiChatResource()` creates the conversation with that component available.
4. `hb-render-message` renders the assistant's component output.

**You own the component.** The model can select from the components you expose and supply their validated props. It does not write a new Angular component or arbitrary markup. Keep authorization for application actions in your own code; a prop schema does not grant permission to perform an action.

## Connect the application

Update the application configuration. If your app already has other providers, keep them in the array.

<hb-code-example header="src/app/app.config.ts">

```ts
import {
  type ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHashbrown } from '@hashbrownai/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHashbrown({ baseUrl: '/api/chat' }),
  ],
};
```

</hb-code-example>

The application entry point bootstraps our root component:

<hb-code-example header="src/main.ts">

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch(console.error);
```

</hb-code-example>

The Angular CLI starter already includes `<app-root></app-root>` in `src/index.html`. Add `proxy.conf.json` at the root of the frontend project:

<hb-code-example header="proxy.conf.json">

```json
{
  "/api/**": {
    "target": "http://127.0.0.1:3001",
    "secure": false
  }
}
```

</hb-code-example>

Start Angular in a second terminal:

```sh
npx ng serve --proxy-config proxy.conf.json
```

## Generate a card

Open the frontend URL shown in your terminal and select **Generate a welcome card**. You'll see a loading message, followed by a card with a title and a short welcome message. The exact wording can vary between requests.

The recording uses the same component and interaction, with a stylesheet for presentation and a scripted model response so the result is repeatable. Your local server uses the model you configured.

<a id="debugging"></a>

## If the card does not appear

- **The request returns 404:** check that the frontend proxy is loaded and the path is `/api/chat`. Restart the frontend server after changing its proxy configuration.
- **The server cannot start:** confirm that `.env` is in `welcome-server` and both environment variables are set.
- **The request fails:** check the server terminal and the browser Network panel. Confirm your key can use the configured model. Keep credentials out of browser code.
- **A response arrives without a card:** check the component name, the schema, and the renderer in your root component. Text chat and UI chat render different kinds of output.

After fixing the cause, select the button again. For more help, see [Debugging](/docs/angular/concept/debugging).

## Next, expose another component

Try adding a second component with different props. Keep its description specific so the model can choose when to use it.

Continue with [Exposing components](/docs/angular/concept/components). When you're ready, learn about [streaming props](/docs/angular/concept/streaming) and [browser-side tools](/docs/angular/concept/functions).
