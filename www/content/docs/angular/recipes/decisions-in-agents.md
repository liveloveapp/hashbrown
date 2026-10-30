---
title: 'Decisions in Agents: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Route support requests through a closed decision schema and fixed server-owned read-only handlers.'
---

# Decisions in Agents

An agent decision maps a request to a small set of application-owned handlers. Use this when the next step has a known set of valid routes, such as order tracking, returns information, or clarification. A typed route is easier to validate and inspect than instructions that ask a model to invent a workflow.

Let’s route a support question. The server will decode a closed decision schema, check its confidence, then select a fixed read-only response. Uncertain input gets a clarification question.

<hb-diagram diagram="recipe-decision-routing"> </hb-diagram>

## Route a support request on the server

This server helper works with either frontend. It receives an unknown decision envelope from the TypeSafe adapter, validates it with `decodeDecision`, and chooses only application-owned public information:

```ts
import { decodeDecision, s } from '@hashbrownai/core';

const supportSchema = s.object('Select a read-only support route', {
  route: s.enumeration('Choose returns, delivery, or clarify', [
    'returns',
    'delivery',
    'clarify',
  ]),
});

export function supportReply(response: unknown): string {
  const decision = decodeDecision(supportSchema, response);
  const score = decision.meta.route.confidence;
  if (!Number.isFinite(score) || score < 0.75 || score > 1) {
    return 'Do you mean delivery information or our returns policy?';
  }
  switch (decision.value.route) {
    case 'returns':
      return 'Public example policy: return unused items within 30 days.';
    case 'delivery':
      return 'Public example delivery window: three to five business days.';
    case 'clarify':
      return 'Do you mean delivery information or our returns policy?';
  }
}
```

Call `HashbrownTypeSafe.decide` from `@hashbrownai/typesafe` with this schema, a bounded user request, an abort signal, and server-only `TYPESAFE_API_KEY` and `TYPESAFE_MODEL`. Pass its returned envelope to `supportReply`; never route directly from unvalidated response JSON. This focused helper throws on an invalid envelope. The enclosing endpoint must handle `DecisionResponseError` and expected provider failures as clarification, propagate cancellation, and preserve unexpected programming errors.

The [standalone support agent](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/agent-routing.ts) includes that complete error boundary, a bounded order-ID check, injected read-only handlers, and cancellation. Its [server composition](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/agent-server.ts) shows the real TypeSafe call. The standalone example uses a `0.7` threshold; the policy above and the recorded plan lesson use `0.75`. Choose a threshold against representative requests. Neither value establishes authorization or calibrated accuracy.

## Explore it in the workbench

<hb-workbench lesson="agent-decisions">
</hb-workbench>

Let's put a decision inside our agent. We'll ask which part of the same two-step plan the user wants explained, then call our own outline or recording handler. When the choice is uncertain, we'll ask for clarification.

<img src="/video/docs/canonical-workbench-agent-decisions-angular-result.png" alt="The Angular conversation shows an application handler reply beside the actual server route decision, confidence, and fallback state." width="1600" height="1000" loading="lazy" />

## Follow the decision

1. Open **Decisions in agents** in the [canonical workbench](/docs/angular/start/workbench).
2. Ask for help outlining the trusted UI demo.
3. Inspect **Agent**: the actual TypeSafe response chooses a known route and includes its confidence.
4. When confidence passes the policy, our server calls the outline handler. A lower score returns a clarification reply.
5. Ask how to record the prepared demo. Inspect the next proposed route and the handler permitted by its confidence.
6. Replay both turns and compare their requests, route choices, handler replies, and unchanged application state.

These recordings use real TypeSafe decisions and keep the actual scores visible. A proposed route below 0.75 still produces clarification, even when that route looks reasonable. A decision response arrives whole. The reply is text supplied by our application handler; it is not streamed model prose.

## Keep the routes small

The server owns three routes:

| Route     | Application behavior                                 |
| --------- | ---------------------------------------------------- |
| `outline` | Explain how to prepare the trusted UI demonstration. |
| `record`  | Explain how to record the prepared demonstration.    |
| `clarify` | Ask which supported part of the plan the user means. |

The browser uses ordinary text chat. The server performs the classification inside the request, validates the response envelope, and selects a fixed handler. We do not need a browser decision hook to make this agent decision.

The model returns a route ID. It cannot supply executable code, choose an arbitrary endpoint, or replace the handlers. Both handlers read the same application-owned plan. Neither executes a step or changes application state.

## Validate before routing

The checked schema defines a closed `outline`, `record`, or `clarify` choice. After decoding the envelope, the server checks that confidence is finite and between 0 and 1. Only a supported route at **0.75** or higher can select its handler.

A low score, invalid envelope, explicit clarification choice, or operationally unavailable classifier produces a clarification reply. Unexpected programming errors remain run errors. Cancellation suppresses late output instead of sending an old handler result into a newer conversation.

Confidence is a model score, not calibrated accuracy. Choose a threshold against representative requests. It does not establish correctness or authorization. A real data lookup still needs its own identity, ownership, and argument checks.

## Read the actual trace

**Requests** shows the SDK's text request and decoded AG-UI events. The **Agent** view projects the server's custom trace: selected route, finite confidence, handler, and fallback reason. That trace contains allowlisted public values, not credentials or an unrestricted provider payload.

The trace and handler reply belong to the same captured run. A follow-up retains the conversation and gets a fresh run ID. Moving through history is read-only: Replay makes no classifier requests and repeats no handler or application action.

## Configure the classifier

Use the checked workbench server and keep credentials in its server-only environment. The host uses `OPENAI_API_KEY` and `OPENAI_MODEL` for its other lessons. Add `TYPESAFE_API_KEY` and an exact `TYPESAFE_MODEL` available to your account for agent decisions. See [TypeSafe](/docs/angular/platform/typesafe).

The local host is a teaching example. Before connecting private data, add the application's authentication, ownership checks, admission limits, and durable state where required. See [Securing a Public Endpoint](/docs/angular/recipes/public-endpoint).

## Read the checked source

- [Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/authoring-workbench.ts) uses actual framework text chat.
- [Server agent wrapper](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-agent.ts) calls TypeSafe, validates the decision, and selects a fixed handler.
- [Route schema and safe trace](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-agent.ts) define the closed contract.
- [Shared capture and actions](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-authoring.ts) keep the neighboring parser and form lessons in the same conversation workbench.

Use [Decisions](/docs/angular/concept/decisions) for browser decision resources. Use [UI selection](/docs/angular/recipes/ui-selection) when the model should choose among application-owned views.
