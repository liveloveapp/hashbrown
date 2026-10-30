---
title: 'Angular Quickstart: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Generate a two-step plan in an ordinary app using one trusted component and a streaming endpoint.'
---

# Angular Quickstart

Let's build a two-step plan. We'll write the card, expose its props, and ask the model to render it. One request is enough to see how generative UI works.

Generative UI means the model selects a component you expose and supplies schema-shaped values for its props. It does not write the component implementation. We'll build the complete application before looking at how the workbench records the same interaction.

<hb-diagram diagram="request-boundary"> </hb-diagram>

## Before we start

This example assumes an existing Angular 22 app using standalone components, Node.js 24, and an OpenAI API key. Choose a model your account can use with structured output.

We'll run the frontend and a small Express server. The browser calls `/api/chat` on its own origin; a development proxy forwards the request to Express on port 3001. Keep the key and model on the server.

<a id="install"></a>

## Install Hashbrown

In the frontend project:

```sh
npm install @hashbrownai/core @hashbrownai/angular
```

Create a sibling directory for the server, outside the frontend source:

```sh
cd ..
mkdir plan-server
cd plan-server
npm init -y
npm install @hashbrownai/core @hashbrownai/openai openai express @ag-ui/core @ag-ui/encoder
npm install --save-dev tsx typescript @types/express @types/node
```

Create `.env` in `plan-server` and add it to `.gitignore`:

```sh
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=your-model-name
```

## Create the endpoint

Create `server.ts` in `plan-server`:

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

The adapter maps the request to OpenAI and returns AG-UI events. `EventEncoder` writes them as a server-sent event stream. A disconnected browser cancels the provider request.

Start the endpoint:

```sh
npx tsx --env-file=.env server.ts
```

This endpoint is for local development. It forwards the client's feature configuration. The workbench pins its public lesson policy on the server. We'll cover that distinction in [System instructions](/docs/angular/concept/system-instructions). Before publishing an endpoint, add request validation, authentication, authorization, and usage limits; see [Securing a public endpoint](/docs/angular/recipes/public-endpoint).

## Write the plan card

Back in the frontend project, create `src/app/plan-card.ts`:

<hb-code-example header="src/app/plan-card.ts">

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Presents validated streaming plan fields, with an optional application-owned footer. */
@Component({
  selector: 'app-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article class="wb-summary" aria-label="Summary card">
    <span class="wb-muted">SummaryCard · trusted component</span>
    <h2>{{ title() || 'Building your plan…' }}</h2>
    <ol>
      @for (step of steps(); track $index) {
        <li>{{ step }}</li>
      }
    </ol>
    <ng-content />
  </article>`,
})
export class PlanCard {
  readonly title = input.required<string>();
  readonly steps = input.required<string[]>();
}
```

</hb-code-example>

The card receives a title and an ordered list of steps. Those bindings render ordinary text. Its optional presentation label and footer belong to the application. Later lessons use the footer for an acceptance action; the first-plan example supplies no footer.

## Expose the component

Create `src/app/first-plan-app.ts`:

<hb-code-example header="src/app/first-plan-app.ts">

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { s } from '@hashbrownai/core';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { PlanCard } from './plan-card';

/** The only UI the model may render: validated title and streaming steps. */
export const firstPlanComponents = [
  exposeComponent(PlanCard, {
    name: 'SummaryCard',
    description: 'Show a concise two-step plan as a preview.',
    input: {
      title: s.string('A concise plan title'),
      steps: s.streaming.array(
        'The ordered plan steps',
        s.string('A concise action'),
      ),
    },
    children: false,
  }),
];

/** Generates a plan using the application-owned component and schema. */
@Component({
  selector: 'app-root',
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main>
    <h1>Your first generated plan</h1>
    <button type="button" [disabled]="chat.isLoading()" (click)="generate()">
      Generate a plan
    </button>
    @if (chat.isLoading()) {
      <p role="status">Creating your plan…</p>
    }
    @if (chat.error()) {
      <p role="alert">Check your server, then try again.</p>
    } @else {
      @for (message of chat.value(); track $index) {
        @if (message.role === 'assistant') {
          <hb-render-message [message]="message" />
        }
      }
    }
  </main>`,
})
export class FirstPlanApp {
  protected readonly chat = uiChatResource({
    system:
      'Help a developer create a small two-step plan for a trusted UI demo. Render exactly one SummaryCard with a short title and exactly two concise steps: outline the demo, then record it. Do not call tools. Rendering is a preview and does not change application state.',
    components: firstPlanComponents,
  });
  protected generate(): void {
    this.chat.sendMessage({
      role: 'user',
      content: 'Create a two-step plan for a trusted UI demo.',
    });
  }
}
```

</hb-code-example>

Let's break this down:

1. `exposeComponent()` registers our `PlanCard` with the model-facing name `SummaryCard`.
2. The schema allows a title and streaming steps. It does not expose the footer or arbitrary children.
3. @hashbrownai/angular!uiChatResource:function creates the conversation. Sending a user message starts the request.
4. `hb-render-message` renders our component from the generated props.

The model supplies values for the contract we exposed. Our component supplies the markup. Rendering the card does not save the plan, record a video, or run either step.

## Connect the frontend

Use @hashbrownai/angular!provideHashbrown:function to connect the app to its endpoint.

Copy the following entry code into `src/main.ts`. The checked example keeps it in `src/first-plan-main.ts` so it can run beside the older examples.

<hb-code-example header="src/first-plan-main.ts">

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { FirstPlanApp } from './app/first-plan-app';
import { appConfig } from './app/app.config';

bootstrapApplication(FirstPlanApp, appConfig).catch(console.error);
```

</hb-code-example>

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

Keep `<app-root></app-root>` in `src/index.html`. The provider points the resource at `/api/chat`.

Configure the development proxy:

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

Start the frontend in a second terminal:

```sh
npx ng serve --proxy-config proxy.conf.json
```

## Generate the plan

Open the frontend URL and choose **Generate a plan**. Watch the title and steps appear as the response arrives. The model's wording can vary.

<a id="debugging"></a>

## If the card does not appear

- **The request returns 404:** check `/api/chat` and restart the frontend after changing its proxy.
- **The server cannot start:** check that `.env` is in `plan-server` and both values are set.
- **The provider rejects the request:** check the server terminal and confirm your key can use the configured model.
- **A response arrives without a card:** compare the exposed `SummaryCard` name, prop schema, and UI renderer. A text-chat response uses a different renderer.

After fixing the cause, send again. Continue with [Debugging](/docs/angular/concept/debugging) when you need to inspect the request.

## Explore it in the workbench

The workbench below replays a recorded run of this lesson.

<hb-workbench lesson="first-plan">
</hb-workbench>

Now we have a standalone app, let's inspect a second implementation of the same component contract. The workbench above uses `PlanCard`, registered as `SummaryCard`, inside the [conversation workbench](/docs/angular/start/workbench). Its endpoint and capturing transport are specific to that teaching app; your standalone endpoint remains `/api/chat`.

To inspect the same interaction, use the **Replay** tab above. Its **UI** view shows the registered component and resolved values. **State** stays unchanged: this is a preview, with no tools or acceptance action.

Compare the declared schema with the resolved props, then scrub the bottom timeline back to the first response values. The workbench captures these observations for inspection. Replaying them sends no provider request and does not write application state.

## Keep the conversation going

Next, follow a second request in [Messages and turns](/docs/angular/concept/ai-basics). Then use [Exposing components](/docs/angular/concept/components) to add an explicit **Accept plan** action and [Tool calling](/docs/angular/concept/functions) to read application state.
