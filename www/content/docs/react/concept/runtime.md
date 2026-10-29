---
title: 'JS Runtime: Hashbrown React Docs'
meta:
  - name: description
    content: 'Run visible JavaScript against your application plan with a narrow QuickJS host capability.'
---

# JavaScript runtime

Let's estimate how long our plan will take. We have two steps. At 15 minutes per step, that's **30 minutes**. Change the estimate to 10 minutes per step and run it again: **20 minutes**. The plan hasn't changed. We've calculated a result from it.

<hb-docs-demo demo="canonical-workbench-javascript-runtime-react">
</hb-docs-demo>

![The React workbench shows submitted code, the actual QuickJS result, and application state at revision zero.](/video/docs/canonical-workbench-javascript-runtime-react-result.png)

## Run the example

Open the [JavaScript runtime workbench](https://workbench.hashbrown.dev/react.html?lesson=javascript-runtime). Start with **15 minutes per step**, then choose **Run in QuickJS**. Next, choose **10 minutes per step** and run again.

These are application-owned scripts running through the real Hashbrown React runtime API. There is no model or provider request in this lesson. Code doesn't stream into a generated component. The workbench captures the submitted source, actual host calls, and the result or error as each occurs.

Use **Code** to inspect the script, **Runtime** to inspect execution, and **State** to compare the application-owned plan. The bottom player moves through captured moments. Replay executes no scripts, host functions, requests, or application writes.

## Give JavaScript a narrow capability

QuickJS runs JavaScript in a separate context. It doesn't have your browser's `document`, `window`, or `fetch`. We explicitly expose one function, `readPlan`, so the script can read a detached snapshot of the current plan.

The handler executes in your host application, outside QuickJS. It checks that the arguments contain exactly one nonnegative integer `revision`, that it matches the current application revision, and that the plan is valid. It then copies the plan. The script cannot use this function to apply a change.

The schema describes the function to the runtime and to a model when you use a JavaScript tool. It does **not automatically validate arguments or results**. Keep validation in the handler.

Start with the [React Quickstart](/docs/react/start/quick), then compare the [complete native client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/RuntimeWorkbench.tsx) and [shared host contract](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-javascript.ts). Call hooks at the top level of your React component or custom hook.

The client creates the native runtime with @hashbrownai/react!useRuntimeFunction:hook and @hashbrownai/react!useRuntime:hook. This excerpt uses the workbench's checked schemas and session controller:

```ts
const read = useRuntimeFunction({
  name: 'readPlan',
  description: 'Read the application-owned plan without changing it.',
  args: workbenchJavaScriptReadPlanSchema,
  result: workbenchJavaScriptPlanResultSchema,
  handler: async (args, signal) => session.readPlan(args, signal),
  deps: [session],
});
const runtime = useRuntime({ functions: [read], timeout: 1_000 });
```

The [session controller](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-javascript-session.ts) owns the current run, validates the host call, forwards cancellation and captures plain values. It rejects work from an inactive conversation or an old run. The full client shows how the session and runtime are connected.

## Submit the exact script

The first script reads the plan and calculates its estimate:

```js
const snapshot = readPlan({ revision: 0 });
({
  revision: snapshot.revision,
  title: snapshot.plan.title,
  stepCount: snapshot.plan.steps.length,
  totalMinutes: snapshot.plan.steps.length * 15,
});
```

The host handler is async. Inside the script, `readPlan(...)` appears synchronous: the QuickJS bridge waits for it before continuing. The final expression supplies the result; this is a script, so don't add a top-level `return`.

```ts
const response = await runtime.run(code, signal);
```

A successful evaluation returns a wrapper such as:

```json
{
  "result": {
    "revision": 0,
    "title": "Show how a model renders trusted UI",
    "stepCount": 2,
    "totalMinutes": 30
  }
}
```

Check the wrapper before using the value. QuickJS evaluation errors return an `error` wrapper; initialization or host failures can also reject the promise. The workbench handles both. A result is application-rendered data, not a model reply or an applied plan.

## Try a failure, then recover

Choose **Missing browser global** and run `document.title`. QuickJS reports a missing browser global. Next, **Invalid host arguments** supplies a string instead of an integer revision. Our host handler rejects it explicitly.

Choose the estimate again. It still returns 30 minutes. A failed evaluation doesn't prevent the next run, and application state remains at revision zero.

The extra presets let you interrupt a loop and check context lifetime. Each call to `runtime.run` creates a new QuickJS runtime and context. Variables do not persist between runs. Keep application data in your application and expose only the functions each script needs.

## Bound execution and handle cancellation

The example configures a 1,000 ms runtime deadline and forwards an AbortSignal to `run`. The SDK combines that signal with its deadline and passes it to exposed handlers. Forward it again when a handler calls cancellable operations such as `fetch`.

QuickJS checks interruption while evaluating JavaScript, including loops. Initialization also consumes the deadline. A caller's timer-based signal depends on the browser event loop; it cannot reliably interrupt synchronous code before the event loop runs. Keep the runtime deadline bounded.

Timeouts don't forcibly stop arbitrary host code, roll back side effects, or impose a memory limit. Keep handlers narrow and bounded. In this example, **Stop**, navigation and disposal invalidate the run so a late outcome cannot replace the current conversation.

## Let a model submit code

Once direct execution is clear, @hashbrownai/react!useToolJavaScript:hook can wrap a runtime as a chat tool. Create a separate runtime for that integration: the workbench's `session.readPlan()` handler is bound to explicit **Run** actions and cannot be reused unchanged by a model tool.

Use the shared `readWorkbenchJavaScriptPlan(args, application)` validator in your model-facing host handler. Read a fresh application snapshot at invocation, forward the model request's cancellation signal, and reject callbacks from inactive or superseded requests. The read-only validator checks the revision and copies the plan; your request lifecycle owns cancellation and origin checks.

Add the returned JavaScript tool to your chat's `tools` collection, using [tools](/docs/react/concept/functions) and your existing provider endpoint. That version requires a model; the direct workbench doesn't. The model receives the exposed function descriptions and type signatures, submits a script, and receives the actual result or error wrapper.

Start with read-only functions. Add mutation capabilities only when their handlers can enforce your application's validation, authorization and resource limits. A sandbox doesn't replace those checks.

## Next steps

- [Expose tools](/docs/react/concept/functions) to read application data or perform checked actions.
- [Use structured output](/docs/react/concept/structured-output) when the task needs typed data rather than code execution.

The [conversation workbench guide](/docs/react/start/workbench#inspect-and-replay) explains the inspector, keyboard controls, and read-only playback.
