---
title: 'Tool Calling: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Read application state through a browser tool and follow its result into the next model request.'
---

# Tool calling

<hb-docs-demo demo="canonical-workbench-tools-angular">
</hb-docs-demo>

Our two-step plan has an accepted version and a revision number. Before proposing a change, the model needs to read both. Let’s give it one small browser tool: `readContext`.

The same conversation appears in [Generative UI](/docs/angular/concept/components). In this lesson, we’ll follow the request, the tool result, and the continuation that produces the card.

## Run the same conversation

Use the [conversation workbench](/docs/angular/start/workbench) with the server environment from the [Quickstart](/docs/angular/start/quick). Start it with `npx nx workbench-serve www`, then open `http://127.0.0.1:4370/angular.html?lesson=tools`. Selecting a lesson does not send a request.

The recording uses this checked Angular client with real provider requests. The local server keeps credentials, instructions, tools, and response schema on the server. Refresh clears the in-memory conversations and accepted plan.

## Read application state

`createTool()` describes a function the model can call. This handler reads the current application snapshot. Recording the result makes it inspectable; reading context does not change the plan.

<hb-code-example header="angular/src/app/workbench.ts">

```ts
      createTool({
        name: 'readContext',
        description:
          'Read the accepted application plan and revision without changing state.',
        handler: async () => {
          const result = this.store.getSnapshot().application;
          this.store.record('tool', { name: 'readContext', result });
          return result;
        },
      }),
```

</hb-code-example>

The React version uses `deps` to keep handler dependencies current; the Angular version reads the session store inside its handler. Both pass this tool in the `tools` collection supplied to `uiChatResource()`.

## Follow the round trip

1. Send the first prompt. The server streams a `readContext` call.
2. Hashbrown runs the browser handler. Its result contains `revision: 0` and `plan: null`.
3. Hashbrown sends that result in a continuation request. The model now has the context it needs to propose a plan.
4. Review the card and select **Accept plan**. This explicit user action advances application state to revision `1`.
5. Send the follow-up. The next tool result contains revision `1` and the accepted plan.

Select **Requests** to see each request and tool result. Select a row to inspect its captured payload in the inspector. The `{ }` toggle shows the original frame.

<img src="/video/docs/canonical-workbench-tools-angular-result.png" alt="The Requests view lists model requests and readContext results from both plan turns." width="1600" height="1000" loading="lazy" />

## Keep reads and writes deliberate

A handler runs when the model calls it. Keep a read like `readContext` separate from a write like accepting the plan. A schema describes values; application code decides whether an action is allowed.

The workbench checks the current turn, application revision, successful completion, and plan rules before accepting. A cancelled or failed response cannot be accepted. Historical playback is read-only, including when you revisit a tool result.

For a remote write, enforce identity, authorization, and validation on the server. See [Securing a public endpoint](/docs/angular/recipes/public-endpoint).

## Tool options and arguments

This tool needs no arguments. Add `schema` when the model must supply values, and validate application rules inside the handler. Pass the provided `AbortSignal` to any asynchronous work that supports cancellation.

### `CreateToolOptions`

| Option        | Type            | Required | Description                                     |
| ------------- | --------------- | -------- | ----------------------------------------------- |
| `name`        | `string`        | Yes      | The name of the function that the LLM will call |
| `description` | `string`        | Yes      | Description of what the function does           |
| `schema`      | `s.SchemaInput` | No       | Schema defining the function arguments          |
| `handler`     | `Function`      | Yes      | The function to execute when called             |

---

### Schema Inputs

The `schema` option accepts:

- Skillet schemas (`s.string`, `s.object`, etc.)
- Standard JSON Schema objects (the `~standard` spec, e.g. Zod/ArkType)
- Raw JSON Schema objects

Standard JSON Schema inputs are normalized to Skillet (draft-07) before streaming and validation. Unsupported keywords throw at runtime.

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/angular/createTool">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>createTool() API</h4>
      <p>See the function signature</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

#### Handler Signatures

**With `input` Arguments:**

<hb-code-example header="handler">

```ts
handler: (input: s.InferSchemaInput<Schema>, abortSignal: AbortSignal) =>
  Promise<Result>;
```

</hb-code-example>

**Without `input` Arguments:**

<hb-code-example header="handler">

```ts
handler: (abortSignal: AbortSignal) => Promise<Result>;
```

</hb-code-example>

---

## Server-Executed Tool Calls

Not every tool the model calls runs in the browser. An agent server can
execute its own tools and stream only the call and its result to Hashbrown.
Those calls appear on the assistant message as `serverToolCalls`, a
display-only list that Hashbrown never executes. Each entry carries the tool's
`name`, its `toolCallId`, a `status`, and `args`: the arguments resolved so
far, growing as the server streams them, or `null` before any JSON has parsed.

| Status       | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `inProgress` | Argument deltas are still arriving; `args` may be partial  |
| `executing`  | The arguments are complete; the server is running the tool |
| `complete`   | The server reported the tool's `result`                    |

Server calls also describe themselves. These fields are optional, and a server
sends only the ones it knows:

| Field              | Meaning                                                                             |
| ------------------ | ----------------------------------------------------------------------------------- |
| `outcome`          | How the call ended: `success`, `failure`, `denied` or `cancelled`                   |
| `label`            | A short, human-readable description of what the call is doing or did                |
| `icon`             | A generic icon name, such as `search`                                               |
| `kind`             | `provider` when the model provider ran the tool, `server` when the agent server did |
| `builtin`          | The provider built-in tool, such as `web_search`                                    |
| `queries`          | The queries the call ran, such as search terms                                      |
| `sources`          | The sources the call produced: `id`, `kind`, `title`, and optionally `href`         |
| `error`            | Why the call failed: `{ message, code? }`                                           |
| `timing`           | `{ startedAt, settledAt? }` in epoch milliseconds                                   |
| `parentToolCallId` | The id of the tool call that spawned this one                                       |

`status` stays `inProgress`, `executing` or `complete`, and a settled call is
always `complete`. `outcome` says how it ended:

| Outcome     | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| `success`   | The call completed                                              |
| `failure`   | The call failed; `result` is rejected with `{ message, code? }` |
| `denied`    | The call was not allowed to run                                 |
| `cancelled` | The call was cancelled before it finished                       |

A `provider` call is never dispatched to a client tool, even one with the
same name.

### The `b4.step` Contract

An AG-UI server describes its tool calls by sending a `b4.step` step record
(version `1`) in one of two carriers: the `metadata['b4.step']` key on the
tool-call events, or a `CUSTOM` event named `b4.step`. Hashbrown merges the
records into the matching `serverToolCalls` entry, so any server that emits
`b4.step`, such as a [B4.run](https://b4.run/docs/ag-ui) agent, has its steps
appear automatically, with no client code to add. Servers that do not emit it
keep working: the fields are simply absent.

### Citations

When the answer cites its sources, the assistant message carries `citations`.
Each citation's `sourceId` is the `id` of a source on one of the message's
server tool calls, or of the message's own `sources`. Alongside `quote`, a
citation may carry `block` and, only when the provider gives true offsets,
`start` and `end`. Some providers also require an `attribution` to be shown
with the answer; each one has `mustRender: true`, so show it unmodified. Show
citations clearly and make them clickable.

Because `args` resolve progressively, a component can render from a server
call before it finishes, the way it does for streaming text.

<hb-code-example header="server tool calls">

```ts
@Component({
  selector: 'app-answer',
  template: `
    @for (call of message().serverToolCalls ?? []; track call.toolCallId) {
      @if (call.name === 'render' && call.args) {
        <app-draft [args]="call.args" />
      }
    }
  `,
})
export class AnswerComponent {
  readonly message = input.required<UiAssistantMessage>();
}
```

</hb-code-example>

Tools you register with @hashbrownai/angular!createTool:function keep
appearing in `toolCalls` exactly as before; only calls with no matching client
tool land in `serverToolCalls`.

---

## Next steps

Read the [complete Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/workbench.ts), or return to the [workbench](/docs/angular/start/workbench). Continue with [Structured output](/docs/angular/concept/structured-output) to use the same tool with typed plan data, or [Generative UI](/docs/angular/concept/components) to focus on the trusted component.
