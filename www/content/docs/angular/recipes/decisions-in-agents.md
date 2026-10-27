---
title: 'Decisions in Agents: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Route a conversation through server-owned read-only handlers using typed decisions and explicit fallback behavior.'
---

# Decisions in Agents

Let's put a decision inside our agent. We'll ask which part of the same two-step plan the user wants explained, then call our own outline or recording handler. When the choice is uncertain, we'll ask for clarification.

<hb-docs-demo demo="canonical-workbench-agent-decisions-angular">
</hb-docs-demo>

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

| Route | Application behavior |
| --- | --- |
| `outline` | Explain how to prepare the trusted UI demonstration. |
| `record` | Explain how to record the prepared demonstration. |
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
