---
title: 'React Quickstart: Hashbrown React Docs'
meta:
  - name: description
    content: 'Generate a two-step plan in an ordinary app using one trusted component and a streaming endpoint.'
---

# React Quickstart

Let's build a two-step plan. We'll write the card, expose its props, and ask the model to render it. One request is enough to see how generative UI works.

<hb-workbench lesson="first-plan">
</hb-workbench>

The recording uses the same `PlanCard` and registration as this example, inside the [conversation workbench](/docs/react/start/workbench). The model knows that component as `SummaryCard`. The inspector and timeline are workbench features; our app needs only the component, @hashbrownai/react!useUiChat:function, and an endpoint.

<img src="/video/docs/canonical-workbench-first-plan-react-result.png" alt="The React first-plan lesson renders a trusted card with a title and two steps, without applying it to application state." width="1600" height="1000" loading="lazy" />

## Before we start

This example assumes an existing React 18 or 19 app using Vite and TypeScript, Node.js 24, and an OpenAI API key. Choose a model your account can use with structured output.

We'll run the frontend and a small Express server. The browser calls `/api/chat` on its own origin; a development proxy forwards the request to Express on port 3001. Keep the key and model on the server.

<a id="install"></a>

## Install Hashbrown

In the frontend project:

```sh
npm install @hashbrownai/core @hashbrownai/react
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

This endpoint is for local development. It forwards the client's feature configuration. The workbench pins its public lesson policy on the server. We'll cover that distinction in [System instructions](/docs/react/concept/system-instructions). Before publishing an endpoint, add request validation, authentication, authorization, and usage limits; see [Securing a public endpoint](/docs/react/recipes/public-endpoint).

## Write the plan card

Back in the frontend project, create `src/PlanCard.tsx`:

<hb-code-example header="src/PlanCard.tsx">

```tsx
import type { ReactNode } from 'react';

/** Presents validated streaming plan fields, with an optional application-owned footer. */
export function PlanCard(props: {
  readonly title: string;
  readonly steps: string[];
  readonly children?: ReactNode;
  readonly label?: string;
}) {
  return (
    <article className="wb-summary" aria-label="Summary card">
      <span className="wb-muted">
        {props.label ?? 'SummaryCard · trusted component'}
      </span>
      <h2>{props.title || 'Building your plan…'}</h2>
      <ol>
        {(props.steps ?? []).map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {props.children}
    </article>
  );
}
```

</hb-code-example>

The card receives a title and an ordered list of steps. Those bindings render ordinary text. Its optional presentation label and footer belong to the application. Later lessons use the footer for an acceptance action; the first-plan example supplies no footer.

## Expose the component

Create `src/FirstPlanApp.tsx`:

<hb-code-example header="src/FirstPlanApp.tsx">

```tsx
import { Fragment } from 'react';
import { s } from '@hashbrownai/core';
import { exposeComponent, useUiChat } from '@hashbrownai/react';
import { PlanCard } from './PlanCard';

/** The only UI the model may render: validated title and streaming steps. */
export const firstPlanComponents = [
  exposeComponent(PlanCard, {
    name: 'SummaryCard',
    description: 'Show a concise two-step plan as a preview.',
    props: {
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
export function FirstPlanApp() {
  const chat = useUiChat({
    system:
      'Help a developer create a small two-step plan for a trusted UI demo. Render exactly one SummaryCard with a short title and exactly two concise steps: outline the demo, then record it. Do not call tools. Rendering is a preview and does not change application state.',
    components: firstPlanComponents,
  });
  return (
    <main>
      <h1>Your first generated plan</h1>
      <button
        type="button"
        disabled={chat.isLoading}
        onClick={() =>
          chat.sendMessage({
            role: 'user',
            content: 'Create a two-step plan for a trusted UI demo.',
          })
        }
      >
        Generate a plan
      </button>
      {chat.isLoading && <p role="status">Creating your plan…</p>}
      {chat.error && <p role="alert">Check your server, then try again.</p>}
      {chat.messages.map((message, index) =>
        message.role === 'assistant' ? (
          <Fragment key={index}>{message.ui}</Fragment>
        ) : null,
      )}
    </main>
  );
}
```

</hb-code-example>

Let's break this down:

1. `exposeComponent()` registers our `PlanCard` with the model-facing name `SummaryCard`.
2. The schema allows a title and streaming steps. It does not expose the footer or arbitrary children.
3. @hashbrownai/react!useUiChat:function creates the conversation. Sending a user message starts the request.
4. `message.ui` renders our component from the generated props.

The model supplies values for the contract we exposed. Our component supplies the markup. Rendering the card does not save the plan, record a video, or run either step.

## Connect the frontend

Use @hashbrownai/react!HashbrownProvider:function to connect the app to its endpoint.

Copy the following entry code into `src/main.tsx`. The checked example keeps it in `src/first-plan-main.tsx` so it can run beside the older examples.

<hb-code-example header="src/first-plan-main.tsx">

```tsx
import { createRoot } from 'react-dom/client';
import { HashbrownProvider } from '@hashbrownai/react';
import { FirstPlanApp } from './FirstPlanApp';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <HashbrownProvider url="/api/chat">
    <FirstPlanApp />
  </HashbrownProvider>,
);
```

</hb-code-example>



The Vite starter needs its usual `<div id="root"></div>` in `index.html`.

Configure the development proxy:

<hb-code-example header="vite.config.ts">

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
```

</hb-code-example>

Start the frontend in a second terminal:

```sh
npm run dev
```

## Generate the plan

Open the frontend URL and choose **Generate a plan**. Watch the title and steps appear as the response arrives. The model's wording can vary.

To inspect the same interaction, open `http://127.0.0.1:4370/react.html?lesson=first-plan` after starting the [workbench](/docs/react/start/workbench). Its **UI** view shows the registered component and resolved values. **State** stays unchanged: this is a preview, with no tools or acceptance action.

<a id="debugging"></a>

## If the card does not appear

- **The request returns 404:** check `/api/chat` and restart the frontend after changing its proxy.
- **The server cannot start:** check that `.env` is in `plan-server` and both values are set.
- **The provider rejects the request:** check the server terminal and confirm your key can use the configured model.
- **A response arrives without a card:** compare the exposed `SummaryCard` name, prop schema, and UI renderer. A text-chat response uses a different renderer.

After fixing the cause, send again. Continue with [Debugging](/docs/react/concept/debugging) when you need to inspect the request.

## Keep the conversation going

Next, follow a second request in [Messages and turns](/docs/react/concept/ai-basics). Then use [Exposing components](/docs/react/concept/components) to add an explicit **Accept plan** action and [Tool calling](/docs/react/concept/functions) to read application state.
