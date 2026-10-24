---
title: 'Decisions in Agents: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Route support requests with server-side typed decisions, read-only handlers, and explicit clarification and recovery.'
---

# Decisions in Agents

Let's build a small support agent. We'll ask a decision model which route fits a customer message, then run our own order lookup or returns handler. When the answer is uncertain, we'll ask the customer to clarify.

<hb-docs-demo demo="agent-routing">
</hb-docs-demo>

<img src="/video/docs/agent-routing-result.png" alt="The support agent answers a returns question with its fixed public example policy: return unused items within 30 days with a receipt." width="920" height="510" loading="lazy" />

The recording runs the checked clients and Express server with scripted decision responses. React supplies the recording; Angular passes the same behavior checks. Presentation styles are added for readability. There is no live model call, narration, or real customer data.

## What we're building

Our application allows three routes:

| Route | What our server does |
| ----- | -------------------- |
| `order` | Checks the requested order ID, then returns the fixed public example for **HB-1042**. |
| `returns` | Returns a fixed policy for unused items within 30 days, with a receipt. |
| `clarify` | Asks which supported question the customer wants answered. |

The decision chooses a route. Our code supplies the handlers and their replies. A confident `order` choice still needs the exact supported order ID; a missing or unknown ID produces a clarification question.

The browser uses ordinary chat to call `/api/agent`. The decision happens inside that server. We don't need a browser decision hook or an additional agent framework for this workflow. We can later call the same routing function from an agent tool or graph node.

## Before we start

Start with the [Quickstart](/docs/angular/start/quick) application. We need Node.js 24, a TypeSafe API key, and an exact model version available to that account. See [TypeSafe](/docs/angular/platform/typesafe) for account and model configuration.

Keep the checked layout: a `server` directory beside `angular`, with `angular/src/app/agent-decisions.ts` inside the frontend directory. Install the core and Angular packages using the Quickstart instructions. In your application's Node server project, install:

```sh
npm install @hashbrownai/core @hashbrownai/typesafe @ag-ui/core @ag-ui/encoder express
npm install --save-dev tsx typescript @types/express @types/node
```

Create a server-side `.env` file, add it to `.gitignore`, and supply your own values:

```sh
TYPESAFE_API_KEY=your-typesafe-api-key
TYPESAFE_MODEL=your-exact-model-version
```

Keep both values on the server. Stop the Quickstart chat server before starting this standalone server, because both use port 3001.

## Choose a route on the server

First, create `server/agent-routing.ts`. The Skillet schema defines `order`, `returns`, and `clarify`. We pass that schema with the selected customer text to the classifier, then use @hashbrownai/core!decodeDecision:function to validate the returned envelope and read its typed value and metadata.

A confidence score below **0.7**, outside the finite range from 0 to 1, or an explicit `clarify` choice returns our clarification question. Treat confidence as a model score. Choose a threshold against representative requests; the score does not establish that the route is correct.

<hb-expander title="Complete server/agent-routing.ts">

<hb-code-example header="server/agent-routing.ts">

```ts
import { DecisionResponseError, decodeDecision, s } from '@hashbrownai/core';
import { DecisionError } from '@hashbrownai/typesafe';

/** The support routes and instructions are owned by this server. */
export const agentSchema = s.object('Choose one read-only support route', {
  route: s.enumeration(
    'Choose order for order tracking, returns for the returns policy, or clarify when the message is ambiguous or unrelated.',
    ['order', 'returns', 'clarify'],
  ),
});

/** A classifier receives only application-selected text and server-owned policy. */
export type AgentClassifier = (options: {
  readonly request: { readonly state: string };
  readonly schema: typeof agentSchema;
  readonly signal: AbortSignal;
}) => Promise<unknown>;

/** Read-only application integrations; the model cannot supply a handler. */
export interface AgentHandlers {
  readonly order?: (orderId: string) => string;
  readonly returns?: () => string;
}

/** A safe follow-up shared by uncertain, invalid and unavailable decisions. */
export const AGENT_CLARIFICATION =
  'Please clarify: ask about order HB-1042 or our returns policy.';

/**
 * Classifies bounded user text, validates the envelope, and invokes a read-only
 * application handler. Confidence gates routing; it is not calibrated accuracy.
 * Cancellation and unexpected programming failures propagate to the caller.
 */
export async function routeAgent(
  text: string,
  classify: AgentClassifier,
  signal: AbortSignal,
  handlers: AgentHandlers = {},
): Promise<string> {
  signal.throwIfAborted();
  let decision;
  try {
    const response = await classify({
      request: { state: text },
      schema: agentSchema,
      signal,
    });
    signal.throwIfAborted();
    decision = decodeDecision(agentSchema, response);
  } catch (error) {
    signal.throwIfAborted();
    if (
      error instanceof DecisionError ||
      error instanceof DecisionResponseError
    )
      return AGENT_CLARIFICATION;
    throw error;
  }
  const confidence = decision.meta.route.confidence;
  if (
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    confidence < 0.7 ||
    decision.value.route === 'clarify'
  )
    return AGENT_CLARIFICATION;

  if (decision.value.route === 'order') {
    const orderIds = text.match(/\bHB-[A-Z0-9]+\b/gi) ?? [];
    if (orderIds.length !== 1 || orderIds[0] !== 'HB-1042')
      return AGENT_CLARIFICATION;
    signal.throwIfAborted();
    return handlers.order
      ? handlers.order('HB-1042')
      : 'Public example: order HB-1042 has shipped and is due Friday.';
  }

  signal.throwIfAborted();
  return handlers.returns
    ? handlers.returns()
    : 'Public example returns policy: return unused items within 30 days with a receipt.';
}
```

</hb-code-example>

</hb-expander>

There are two separate checks here. The model selects `order`; application code checks that the message contains exactly the supported **HB-1042** ID before invoking the handler. Classification does not establish identity, ownership, or authorization.

`DecisionError` and `DecisionResponseError` also produce clarification. An aborted signal propagates, and an unexpected programming failure reaches the run's error handler. We don't start a second model call to recover from an uncertain result.

## Expose the agent endpoint

Next, create `server/agent-app.ts`. It validates the AG-UI request before opening a stream. It accepts bounded plain-text conversation messages and selects only the latest user text for classification. Browser system instructions, state, and forwarded questions cannot replace our schema or request policy.

The example limits JSON to 64kb, conversation history to 100 messages, each serialized message to 10,000 characters, and the latest customer text to 4,000 characters. Tool and resume requests are rejected. These limits keep this tutorial's input contract small; choose limits appropriate to your application.

<hb-expander title="Complete server/agent-app.ts">

<hb-code-example header="server/agent-app.ts">

```ts
import { EventType } from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { EventEncoder } from '@ag-ui/encoder';
import express, { type ErrorRequestHandler } from 'express';
import {
  type AgentClassifier,
  type AgentHandlers,
  routeAgent,
} from './agent-routing';

/** Dependencies for the local public-data support example. */
export interface AgentAppOptions {
  readonly classify: AgentClassifier;
  readonly handlers?: AgentHandlers;
}

function parseInput(
  body: unknown,
):
  | { readonly status: 400 | 413; readonly error: string }
  | {
      readonly threadId: string;
      readonly runId: string;
      readonly text: string;
    } {
  const parsed = RunAgentInputSchema.safeParse(body);
  if (!parsed.success)
    return { status: 400, error: 'Invalid AG-UI run input' } as const;
  const input = parsed.data;
  if (
    !/^[a-zA-Z0-9_-]{1,80}$/.test(input.threadId) ||
    input.runId.length < 1 ||
    input.runId.length > 120
  )
    return { status: 400, error: 'Invalid run identity' } as const;
  if (
    input.messages.length > 100 ||
    input.messages.some((message) => JSON.stringify(message).length > 10000)
  )
    return { status: 413, error: 'Conversation is too large' } as const;
  if (input.tools.length || input.resume !== undefined)
    return { status: 400, error: 'Only text runs are supported' } as const;
  const messages = input.messages.filter(
    (message) => message.role !== 'system' && message.role !== 'developer',
  );
  if (
    messages.some(
      (message) =>
        (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string' ||
        (message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0),
    )
  )
    return { status: 400, error: 'Only plain text is supported' } as const;
  const latest = messages.at(-1);
  if (
    latest?.role !== 'user' ||
    typeof latest.content !== 'string' ||
    !latest.content.trim()
  )
    return { status: 400, error: 'End with a user message' } as const;
  if (latest.content.length > 4000)
    return { status: 413, error: 'User message is too large' } as const;
  return {
    threadId: input.threadId,
    runId: input.runId,
    text: latest.content,
  } as const;
}

/**
 * Creates a local AG-UI endpoint over public example data. Hosted deployments
 * must add identity, ownership checks and request controls before customer access.
 */
export function createAgentApp(options: AgentAppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.post('/api/agent', async (req, res) => {
    const input = parseInput(req.body as unknown);
    if ('status' in input) {
      res.status(input.status).json({ error: input.error });
      return;
    }
    const controller = new AbortController();
    const disconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', disconnect);
    res.once('close', disconnect);
    const encoder = new EventEncoder();
    res.setHeader('Content-Type', encoder.getContentType());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const identity = { threadId: input.threadId, runId: input.runId };
    try {
      res.write(
        encoder.encodeSSE({ type: EventType.RUN_STARTED, ...identity }),
      );
      const reply = await routeAgent(
        input.text,
        options.classify,
        controller.signal,
        options.handlers,
      );
      controller.signal.throwIfAborted();
      const messageId = `reply-${input.runId}`;
      res.write(
        encoder.encodeSSE({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        }),
      );
      res.write(
        encoder.encodeSSE({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: reply,
        }),
      );
      res.write(
        encoder.encodeSSE({ type: EventType.TEXT_MESSAGE_END, messageId }),
      );
      res.write(
        encoder.encodeSSE({ type: EventType.RUN_FINISHED, ...identity }),
      );
      res.end();
    } catch {
      if (controller.signal.aborted) return;
      res.write(
        encoder.encodeSSE({
          type: EventType.RUN_ERROR,
          message: 'The agent could not finish. Choose Run agent to retry.',
        }),
      );
      res.end();
    } finally {
      controller.abort();
      req.off('aborted', disconnect);
      res.off('close', disconnect);
    }
  });
  const jsonError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const tooLarge =
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? 'Request body is too large' : 'Invalid JSON request',
    });
  };
  app.use(jsonError);
  return app;
}
```

</hb-code-example>

</hb-expander>

The route emits `RUN_STARTED`, a plain-text assistant message, and `RUN_FINISHED`. A clarification is a completed reply. An unexpected failure emits `RUN_ERROR` with a generic retry message. Disconnecting aborts the classifier and prevents a late handler reply.

Finally, create `server/agent-server.ts`. This file reads our server configuration and supplies the real `HashbrownTypeSafe.decide` adapter to the app.

<hb-expander title="Complete server/agent-server.ts">

<hb-code-example header="server/agent-server.ts">

```ts
import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
import { createAgentApp } from './agent-app';

// Credentials and model selection belong on the server. The local example uses
// public fixture data; add hosted identity, ownership and request controls before
// connecting a real customer-data service.
const apiKey = process.env['TYPESAFE_API_KEY'];
const model = process.env['TYPESAFE_MODEL'];
if (!apiKey || !model)
  throw new Error('Set TYPESAFE_API_KEY and TYPESAFE_MODEL in .env');

const app = createAgentApp({
  classify: ({ request, schema, signal }) =>
    HashbrownTypeSafe.decide({
      apiKey,
      model,
      request,
      schema,
      signal,
      maxRequestChars: 16_000,
    }),
});

app.listen(3001, '127.0.0.1', () => {
  console.log('Hashbrown support agent: http://127.0.0.1:3001/api/agent');
});
```

</hb-code-example>

</hb-expander>

From the directory containing `server` and `.env`, start the endpoint:

```sh
npx tsx --env-file=.env server/agent-server.ts
```

It listens at **http://127.0.0.1:3001/api/agent**. This is a local development server over public example data. Before hosting a credential-backed endpoint or connecting customer records, add authentication, ownership checks, authorization, and request controls. The [Public endpoint](/docs/angular/recipes/public-endpoint) recipe explains those integration points.

## Connect the client

Update `angular/src/main.ts` to bootstrap the checked component with the Quickstart application configuration:

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AgentDecisions } from './app/agent-decisions';
import { appConfig } from './app/app.config';

bootstrapApplication(AgentDecisions, appConfig).catch(console.error);
```

In `angular/src/index.html`, replace the Quickstart's `<app-root></app-root>` element with `<app-agent-decisions></app-agent-decisions>` so the bootstrap selector matches.

Keep `provideHashbrown` in `appConfig`. The component's `chatResource` sets `apiUrl: '/api/agent'` explicitly, so this request uses our support server.

Keep the Angular development proxy from the Quickstart:

```json
{
  "/api": {
    "target": "http://127.0.0.1:3001",
    "secure": false
  }
}
```

Run the frontend with `ng serve --proxy-config proxy.conf.json` in a second terminal.

The browser calls `/api/agent` on the frontend origin, and the development proxy forwards the request to port 3001. There is no separate `/api/decide` request in this recipe.

Create `angular/src/app/agent-decisions.ts` below. Opening the page or editing **Customer message** sends nothing. **Run agent** replaces the previous messages with a fresh user message and a new ID. Each run answers one independent support request.

<hb-expander title="Complete angular/src/app/agent-decisions.ts">

<hb-code-example header="angular/src/app/agent-decisions.ts">

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { chatResource } from '@hashbrownai/angular';

/** Runs a fresh support request through the server-owned decision workflow. */
@Component({
  selector: 'app-agent-decisions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Route a support request</h1>
      <label for="customer-message">Customer message</label>
      <textarea
        id="customer-message"
        [value]="prompt()"
        (input)="onInput($event)"
      ></textarea>
      <nav aria-label="Agent actions">
        <button
          type="button"
          [disabled]="busy() || !prompt().trim()"
          (click)="run()"
        >
          Run agent
        </button>
        <button type="button" [disabled]="!busy()" (click)="cancel()">
          Cancel
        </button>
      </nav>
      <p role="status">{{ status() }}</p>
      @if (chat.error() && !stopped() && !busy()) {
        <p role="alert">
          Check your server, then select Run agent to try again.
        </p>
      }
      <h2>Agent reply</h2>
      <section aria-label="Agent reply" [attr.aria-busy]="busy()">
        <p>{{ reply() }}</p>
      </section>
    </main>
  `,
})
export class AgentDecisions {
  protected readonly prompt = signal('Where is order HB-1042?');
  private readonly started = signal(false);
  protected readonly stopped = signal(false);
  protected readonly chat = chatResource({
    system: '',
    apiUrl: '/api/agent',
    debugName: 'agent-decisions',
  });
  protected readonly busy = computed(
    () =>
      this.chat.isSending() ||
      this.chat.isReceiving() ||
      this.chat.isGenerating() ||
      this.chat.isLoading(),
  );
  protected readonly reply = computed(() => {
    // Resource values throw on error, so check before reading the messages.
    if (this.chat.error() || this.stopped()) return '';
    const message = [...this.chat.value()]
      .reverse()
      .find((message) => message.role === 'assistant');
    return typeof message?.content === 'string' ? message.content : '';
  });
  protected readonly status = computed(() => {
    if (this.stopped()) return 'Stopped. Run agent to start again.';
    if (this.busy()) return 'Running agent…';
    if (this.chat.error()) return 'Request failed. Run agent to try again.';
    if (!this.started()) return 'Ready';
    if (
      this.chat.lastRunFinishReason() &&
      this.chat.lastRunFinishReason() !== 'stop'
    )
      return 'Reply ended early. Run agent to try again.';
    return 'Agent reply complete.';
  });

  protected onInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLTextAreaElement).value);
  }

  protected run(): void {
    if (this.busy() || !this.prompt().trim()) return;
    this.started.set(true);
    this.stopped.set(false);
    this.chat.setMessages([
      { id: crypto.randomUUID(), role: 'user', content: this.prompt().trim() },
    ]);
  }

  protected cancel(): void {
    if (!this.busy()) return;
    this.stopped.set(true);
    this.chat.stop();
  }
}
```

</hb-code-example>

</hb-expander>

All sending, receiving, generating, and loading states keep **Run agent** disabled and **Cancel** available. Cancel stops the request, clears the visible reply, and leaves a stopped status. A later Run starts again. The reply is rendered as plain text, and refresh clears the component's state.

## Try both routes

1. Leave **Where is order HB-1042?** in **Customer message**, then select **Run agent**. With a confident `order` decision, the reply says the public example has shipped and is due Friday.
2. Replace the message with **What is your returns policy?** and run again. With a confident `returns` decision, the reply describes the 30-day policy.
3. Ask **Where is order HB-9999?** A decision may still choose `order`, but our handler guard asks for clarification because the example supports only HB-1042.
4. Run a request and select **Cancel** while it is pending. The stopped status remains visible. Submit another request to recover; the cancelled run cannot replace its reply.

Live classifications can differ from the recording. If a question is not routed confidently, clarify the supported request and run again. This example reads fixed data; it does not issue refunds or change an order.

## Handle uncertainty and failure

<hb-docs-demo demo="agent-fallback">
</hb-docs-demo>

This second recording injects an uncertain decision, an expected provider failure, and an unexpected programming failure into the checked server. It ends with a successful explicit retry.

| Result | What we show | What to do next |
| ------ | ------------ | --------------- |
| Low or invalid confidence, malformed envelope, or `clarify` | “Please clarify: ask about order HB-1042 or our returns policy.” | Edit the request and run again. |
| Expected `DecisionError` | The same clarification reply. | Check server credentials, model access and provider availability; then retry. |
| Unexpected server failure | A failed status and explicit retry instruction. | Inspect the server, fix the failure, then choose **Run agent**. |
| Cancelled run | A stopped status. | Choose **Run agent** to start a fresh request. |

Clarification is deliberately the same for an uncertain answer and an unavailable classifier. If your application needs to distinguish them operationally, add server-side diagnostics without exposing provider details to the customer. Cancellation never becomes a clarification reply.

For a 404, check `/api/agent` and the frontend proxy, then restart the frontend after proxy changes. If the server does not start, check both `TYPESAFE_API_KEY` and `TYPESAFE_MODEL` in its environment. An unavailable classifier can produce a completed clarification reply, so don't use chat completion alone as evidence that the provider succeeded.

## Recipe B: Decisions over AG-UI

The workflow above makes a decision **inside** an agent and sends its text reply through AG-UI. A different application may need browser decisions to travel over an existing AG-UI connection.

That requires an application-specific @hashbrownai/core!DecisionTransport:type implementation on both sides. Hashbrown does not provide a built-in AG-UI decision adapter. The transport receives a decision request and `AbortSignal`, then resolves with the decision response envelope for Hashbrown to decode.

If you adopt this approach, define and test a protocol such as:

| Part | Application contract |
| ---- | -------------------- |
| Request | A fresh AG-UI run carries the bounded decision input in an agreed `forwardedProps` field. The server pins its own schema. |
| Success | `RUN_STARTED`, then `RUN_FINISHED` with the unchanged decision envelope in `result`. |
| Failure | An agreed `RUN_ERROR` code maps to a transport error with explicit retryability. A missing result or interrupted run is a protocol failure. |
| Cancellation | The browser aborts the request, the server cancels its classifier, and no decision is applied. |

You own SSE parsing, terminal-event validation, error mapping, retries, and cancellation for that custom transport. Test dropped streams, missing results, interruption, and aborts before using it in an application. For a complete browser decision workflow using the standard HTTP route, see [UI Selection](/docs/angular/recipes/ui-selection).

## Next steps

Read [Decisions](/docs/angular/concept/decisions) for closed questions and confidence routing, and [TypeSafe](/docs/angular/platform/typesafe) for adapter configuration and errors. Use [UI Selection](/docs/angular/recipes/ui-selection) when the decision selects a visible application-owned view. For customer conversation storage, continue with [Server threads](/docs/angular/recipes/threads).
