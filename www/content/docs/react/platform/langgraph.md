---
title: 'LangGraph without B4: Hashbrown React Docs'
meta:
  - name: description
    content: 'Connect plain LangGraph agents, tool progress and durable step history to Hashbrown through AG-UI.'
---

# LangGraph without B4

<hb-docs-demo demo="canonical-workbench-tools-react">
</hb-docs-demo>

The teaser demonstrates browser tool calls in the OpenAI-backed client flow. It does not demonstrate a LangGraph server, the optional `/ui` helper, or durable graph restoration.

Connect a plain LangGraph agent to Hashbrown through a standard AG-UI endpoint. Your graph runs on the server; Hashbrown renders headless conversation state in the browser. You do not need a B4 agent, CLI, route or runtime. The optional Node helper supplies tool-step descriptions; your AG-UI bridge still owns tool lifecycle events.

> Release boundary: `@b4run/langgraph/ui` is not published in `@b4run/langgraph` 0.15.2. Use this guide only once a release explicitly includes that subpath. The Python source recipe below does not require a B4 Python package.

<hb-diagram diagram="langgraph-agent-boundary">
</hb-diagram>

## Describe JavaScript server tools

The Node-only helper exports `toolStepMiddleware`, `emitToolStep`, `ToolStepDisplay` and `ToolStepMiddlewareOptions`. Its optional peer baseline is `@langchain/core` 1.2.12, `langchain` 1.5.12 and `@langchain/langgraph` 1.4.17. Install compatible peers in your server project alongside a release containing `/ui`.

Pass your configured model and application approval middleware to this [tested plain-agent recipe](https://github.com/cacheplane/b4run/blob/main/packages/langgraph/examples/plain-agent.ts):

```ts
import { toolStepMiddleware } from '@b4run/langgraph/ui';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { tool } from '@langchain/core/tools';
import { type AgentMiddleware, createAgent } from 'langchain';

/** Build a plain agent with an application-supplied model (for example gpt-5-mini). */
export function createLookupAgent(
  model: BaseChatModel,
  approvalGate: AgentMiddleware,
) {
  const lookup = tool(async () => 'Found record', {
    name: 'lookup',
    description: 'Look up a record',
    schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    } as const,
  });
  return createAgent({
    model,
    tools: [lookup],
    middleware: [
      approvalGate,
      toolStepMiddleware({
        display: {
          lookup: {
            icon: 'search',
            running: () => 'Looking up record',
            done: (_args, message) =>
              typeof message.content === 'string'
                ? message.content
                : 'Found record',
            sources: (message) => [
              {
                id: message.tool_call_id,
                kind: 'record',
                title: 'Lookup result',
              },
            ],
          },
        },
      }),
    ],
  });
}
```

Middleware runs outermost first. Keep approval and authorization gates outside `toolStepMiddleware`, as above, so its running event means the tool has actually started. Names missing from `display` still emit a bare server step. `done` and `sources` receive the actual matching LangChain `ToolMessage`, including content and artifacts, rather than a raw handler return value. Callback failures fall back to bare display fields; labels are limited to 120 Unicode code points.

Error-status ToolMessages and ordinary thrown failures become failed steps with readable errors. Existing denial, cancellation and failure remain settled. Graph interrupts propagate without false completion; aborted work stays cancelled and preserves control flow. Command results preserve unrelated state and control fields; a Command without one unambiguous matching ToolMessage receives no fabricated completion.

## Emit from a graph node

Use the runnable config explicitly when emitting from your own node. Append the returned ToolMessage to graph state so the checkpointer can save the settled step. This [tested manual recipe](https://github.com/cacheplane/b4run/blob/main/packages/langgraph/examples/manual-tool.ts) demonstrates the success path:

```ts
import { emitToolStep } from '@b4run/langgraph/ui';
import { ToolMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';

/** Run approved work in a graph node and return a message to append to state.messages. */
export async function lookupWithSteps(
  config: RunnableConfig,
  toolCallId: string,
) {
  const running = {
    v: 1,
    kind: 'server',
    status: 'running',
    startedAt: Date.now(),
  } as const;
  await emitToolStep(config, { ...running, toolCallId });
  const content = 'Found record';
  const step = {
    ...running,
    status: 'completed',
    settledAt: Date.now(),
    label: content,
  } as const;
  await emitToolStep(config, { ...step, toolCallId });
  return new ToolMessage({
    content,
    tool_call_id: toolCallId,
    additional_kwargs: { b4_step: step },
  });
}
```

For a failure, store `status: 'failed'` and `error: { message, code? }` in the step and return a readable error-status ToolMessage. Preserve graph interrupts and cancellation instead of turning them into successful messages. Approval must finish before you emit running or execute the work.

CUSTOM values require `toolCallId`. The persisted `additional_kwargs.b4_step` omits it because the ToolMessage already identifies the call. `emitToolStep(undefined, step)` can use Node's active runnable config. Invalid producer identity, version, kind or status throws `TypeError`. Awaited dispatch failures are secondary to execution; detached callback failures retain LangChain's own `raiseError`/`awaitHandlers` policy. Outside a streamed runnable, or without a listener, there is no live event. The helper emits no standard START/ARGS/END/RESULT frames.

## Python producer and AG-UI hosting

Copy the [tested `python_tool_steps.py` source](https://github.com/cacheplane/b4run/blob/main/packages/langgraph/examples/python_tool_steps.py) into your server project. There is no B4 PyPI package. Its `lookup_with_steps(config, tool_call_id, lookup)` emits `adispatch_custom_event("b4.step", value, config=config)` around your async lookup and returns a checkpointable ToolMessage. Add that message to your graph's `messages` state. Producer values follow the [published v1 JSON Schema](https://b4.run/docs/api/sdk).

The same source provides `StepLangGraphAgent`, which decorates the bridge's public `get_state_and_messages_snapshots` hook. Compile your application graph with a durable server checkpointer, then host it at `/run`:

```python
from fastapi import FastAPI
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from python_tool_steps import StepLangGraphAgent

app = FastAPI()
# graph is your compiled graph with a durable server checkpointer.
agent = StepLangGraphAgent(name="lookup", graph=graph)
add_langgraph_fastapi_endpoint(app, agent, path="/run")
```

The executable recipe integration was verified with `ag-ui-langgraph` 0.0.47, `ag-ui-protocol` 1.0.0, `langchain` 1.4.7, `langchain-core` 1.7.0, `langgraph` 1.2.17 and `pydantic` 2.14.1, without model calls. Its MemorySaver is a test fixture; production restore requires a durable server checkpointer. Recheck bridge extension points when upgrading.

## Preserve steps when restoring a thread

CUSTOM events are live-only. Saving browser canonical history and saving graph checkpoints are separate responsibilities. A durable checkpoint saves the settled `ToolMessage.additional_kwargs.b4_step`; the restore bridge must project it into AG-UI `ToolMessage.metadata['b4.step']`, and project a failed step's readable error text into `ToolMessage.error`. Stock converters can discard that metadata and reduce failures to generic errors.

The Python subclass reads one checkpoint, requires a durable `checkpoint_id`, and pins the parent's read to that exact checkpoint. It decorates the parent's MESSAGES_SNAPSHOT by an unambiguous root `tool_call_id`, preserving parent IDs, existing metadata and subagent processing. Duplicate or child identities are skipped. The owned projection ignores unknown fields and versions and leaves its inputs unchanged. Use the whole source recipe rather than a second moving latest-state read.

A JavaScript AG-UI bridge must perform the same checkpoint-to-metadata projection. The current JavaScript bridge snapshot implementation is private: the Python public-hook subclass is not a JavaScript override recipe. Wire your graph through the bridge's supported streaming endpoint so standard TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END and TOOL_CALL_RESULT frames retain their call IDs and parent assistant IDs. CUSTOM augments those frames; it does not replace them. A step arriving before START is held until the call is announced.

Authorize access to each server thread independently of its `threadId`. Keep credentials, model selection, checkpointers and server-tool permissions on the server. See the [custom provider contract](/docs/react/platform/custom) for Hashbrown transport and structured-output requirements; AG-UI connectivity alone does not guarantee every Hashbrown feature.

## Connect React and render steps

Configure the endpoint on the provider, then create the conversation with `useChat`:

```tsx
import { HashbrownProvider, useChat } from '@hashbrownai/react';

/** Accept an absolute HTTP(S) source URL without changing its value. */
function isHttpSourceUrl(href: string | undefined): href is string {
  if (!href) return false;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function App() {
  return (
    <HashbrownProvider url="/run">
      <Conversation />
    </HashbrownProvider>
  );
}

function Conversation() {
  const chat = useChat({
    system: 'Help the user look up records.',
    threadId: 'record-thread',
  });
  return (
    <>
      {chat.messages.map((message) =>
        message.role === 'assistant' ? (
          <section key={message.id}>
            {message.serverToolCalls?.map((call) => (
              <div key={call.toolCallId}>
                <p>
                  {call.label ?? call.name} · {call.outcome ?? call.status}
                </p>
                {call.error && <p role="alert">{call.error.message}</p>}
                {call.sources?.map((source) => (
                  <p key={source.id}>
                    {isHttpSourceUrl(source.href) ? (
                      <a href={source.href}>{source.title}</a>
                    ) : (
                      source.title
                    )}
                  </p>
                ))}
              </div>
            ))}
          </section>
        ) : null,
      )}
    </>
  );
}
```

Treat source URLs as untrusted: the example links only absolute HTTP(S) URLs and displays other source titles as plain text. It preserves accepted URLs without rewriting or tracking them.

Hashbrown provides state, so your application chooses the step UI. `serverToolCalls` are display-only and are never dispatched to browser tools. Standard lifecycle is `inProgress` while arguments stream, `executing` after arguments end, and `complete` after settlement. `outcome` refines completion as `success`, `failure`, `denied` or `cancelled`; show errors and sources as well as the label. A running custom step records actual execution timing even when approval delayed execution after arguments ended.

Keep client tools in `toolCalls` through the normal framework tool API. Do not register a browser implementation for a server-only tool. The helper adds no built-in UI or provider normalization. File-search integration remains deferred.

## Explore it in the workbench

Open `/react.html?lesson=tools` in the [conversation workbench](/docs/react/start/workbench). Ask for a plan, then inspect the `readContext` call, its result, and the continuation in **Requests**. The tool reads application context without accepting the proposal.

This is a browser-tool exercise. It gives us a client flow to compare with the server-owned `serverToolCalls` above, but it does not run LangGraph, test the optional helper's release availability, or restore a graph checkpoint. Verify those separately with the linked plain-agent and Python recipes. Keep the difference visible in your UI: a displayed server step must never dispatch a browser handler.
