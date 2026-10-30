---
title: 'Platforms: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Connect Hashbrown to a provider, a decision service, or a browser-local model.'
---

# Platforms

<hb-docs-demo demo="canonical-workbench-first-plan-angular">
</hb-docs-demo>

Your components and client APIs stay in your application. Choose where the model runs, then connect that runtime to Hashbrown. Let's separate streaming chat, decisions, and browser-local inference so each setup has a clear starting point.

The teaser shows a real OpenAI-backed client. The integration guides below explain the other runtimes separately; the recording does not verify those providers.

<hb-diagram diagram="request-boundary"> </hb-diagram>

## Stream through a server adapter

These adapters translate provider responses into the AG-UI events your Hashbrown client consumes. They map text, tool calls and structured-output requests. The selected model or deployment must support the features you request; an adapter does not add a missing model capability.

| Provider setup                                   | Hashbrown package        |
| ------------------------------------------------ | ------------------------ |
| [OpenAI](/docs/angular/platform/openai)          | `@hashbrownai/openai`    |
| [Azure OpenAI](/docs/angular/platform/azure)     | `@hashbrownai/azure`     |
| [Anthropic](/docs/angular/platform/anthropic)    | `@hashbrownai/anthropic` |
| [Amazon Bedrock](/docs/angular/platform/bedrock) | `@hashbrownai/bedrock`   |
| [Google Gemini](/docs/angular/platform/google)   | `@hashbrownai/google`    |
| [Ollama](/docs/angular/platform/ollama)          | `@hashbrownai/ollama`    |

Each setup guide includes its provider SDK dependency and server configuration. Keep credentials on the server, select the model there, and return the adapter's stream from your endpoint. Start with the [Quickstart](/docs/angular/start/quick) for the browser-to-endpoint wiring.

The OpenAI and Azure adapters use the Responses API. An OpenAI-compatible Chat Completions endpoint alone is not enough for those adapters. Ollama uses its own adapter and server; it is a separate setup from a model running inside the browser.

Structured-output support and accepted schema constructs depend on the provider and model. Verify your schema and tool flow against the deployment you will use. [Request customization](/docs/angular/concept/transform-request-options) shows how to adjust the provider request on the server.

## Answer decisions with TypeSafe

Use [`@hashbrownai/typesafe`](/docs/angular/platform/typesafe) when the task is to choose among known options. Its server adapter validates a decision request, calls TypeSafe, and returns a JSON decision response. It uses global `fetch` and needs no separate provider SDK.

TypeSafe is a decision service, so it does not replace the streaming chat endpoint. An agent can use a decision to select a workflow, then generate a response with another provider. Follow [Decisions in Agents](/docs/angular/recipes/decisions-in-agents) for that boundary and a recorded example.

## Run a model in the browser

[Local Models](/docs/angular/recipes/local-models) covers Chrome and Edge transports and an application-owned WebLLM engine. These use browser-side inference instead of the server adapters above. Availability, preparation, downloads and fallback behavior belong in the application flow; the checked recipe begins with an explicit preparation action.

The local-model recording uses real Chrome inference. The guide distinguishes that verified path from the other runtime options.

## Use another server

For ASP.NET Core, use the [tested .NET AG-UI integration](/docs/angular/platform/dotnet). For another provider or agent runtime, [create a custom adapter](/docs/angular/platform/custom) that produces the AG-UI events your client needs. Start from the event contract and verify tool continuation and structured output as part of that integration.

If you need a complete chat interface, [Threadplane](/docs/angular/recipes/threadplane) supplies the presentation layer around the runtime. It is a separate choice from the provider that answers requests.

## Explore it in the workbench

The [workbench](/docs/angular/start/workbench) uses a checked OpenAI server adapter for its public streaming lessons. Start **First plan**, inspect the request and streamed response, then follow a provider guide to configure your own endpoint. Reuse the frontend contract where the provider supports it; verify tool and schema behavior on that deployment.

<hb-workbench-launcher lesson="first-plan">
</hb-workbench-launcher>

For the separate runtime paths, open **Decisions** for an actual TypeSafe request or **Local models** for the checked Chrome inference path. The [production recovery reference](/docs/angular/platform/b4run) runs a separate opt-in server with Postgres; it is not part of the anonymous public backend.
