---
title: 'Choosing a Model: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Choose a model by the task, output contract, latency, and failure behavior; configure it on the server.'
---

# Choosing a Model

<hb-docs-demo demo="canonical-workbench-structured-angular">
</hb-docs-demo>

A model turns context into a response. Choosing one starts with the job your application needs to do: answer a question, return typed data, select a known option, or propose a component. Those jobs place different demands on a model.

Hashbrown separates that choice from your Angular interface. The client sends a run to your endpoint; your server selects the provider and model. You can compare models while keeping the same application contract.

## Start with the task

Write down a small set of representative inputs before comparing models. Include an ordinary request, an ambiguous request, a long conversation, and a request the application should decline. Keep the schema, tools, and instructions the same during the comparison.

| What to check        | What to observe                                                                         |
| -------------------- | --------------------------------------------------------------------------------------- |
| Required capability  | Does the selected deployment support your schema, tools, and output mode?               |
| Useful response time | When can the user read a useful value, and when does the run complete?                  |
| Result quality       | Does the response satisfy application rules as well as the schema?                      |
| Failure behavior     | How does the interface handle refusal, truncation, cancellation, or unavailable output? |
| Operating limits     | Can your service support the expected context size, traffic, and provider usage?        |

A fast first token is useful for a text preview. A short, valid completed result may matter more for a decision or an application write. Measure the behavior your user actually needs.

<hb-diagram diagram="request-boundary"> </hb-diagram>

## Select the model on the server

Here is a reusable server module for an OpenAI-backed AG-UI endpoint. Install the packages in the [OpenAI guide](/docs/angular/platform/openai), set the two environment variables, and pass the endpoint's validated run input and disconnect signal into this function. Your HTTP handler still owns authentication, authorization, request validation, and SSE encoding.

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';

export function streamReply(input: RunAgentInput, signal?: AbortSignal) {
  const apiKey = process.env['OPENAI_API_KEY'];
  const model = process.env['OPENAI_MODEL'];
  if (!apiKey || !model)
    throw new Error('Configure the provider on the server');

  return HashbrownOpenAI.stream.text({ apiKey, model, input, signal });
}
```

The Angular resources do not take a provider `model` option. Keep provider credentials and unrestricted model identifiers out of browser configuration. Follow the [Quickstart](/docs/angular/start/quick) to connect the frontend to the endpoint.

## Route between models

If different tasks need different models, select among server-owned configurations after checking the caller's access. Separate endpoints can make that policy clear. A request for a short suggestion may use a different configuration from a long-running agent, while both return the protocol their client expects.

Changing providers also means checking provider capabilities. An adapter translates events; it cannot add schema or tool support that a deployment does not have. See [Platforms](/docs/angular/start/platforms) for the supported integration paths.

## Explore it in the workbench

Open [Structured output](/docs/angular/concept/structured-output) in the [workbench](/docs/angular/start/workbench). The teaser uses real OpenAI output; it is one observed run, not a benchmark or a comparison between providers.

<hb-workbench-launcher lesson="structured-output">
</hb-workbench-launcher>

1. Run the same first prompt with your current server model configuration. Inspect **Requests** and **JSON** and record the completed result.
2. Change the server-owned `OPENAI_MODEL`, restart the local host, and begin a fresh conversation. Reuse the prompt and response schema.
3. Compare resolved values, completion, and the application's acceptance checks. Replay each capture to inspect it without another provider request.

Keep the original responses when a model fails. A successful demonstration alone does not show how your application behaves under ambiguous input or a failed run.
