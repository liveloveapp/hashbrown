---
title: 'Introduction: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Build a two-step plan with a trusted component, streaming values, and application-owned behavior.'
---

# Introduction

Let's build a small plan together. We ask for a title and two steps. Hashbrown streams those values into a component we wrote.

<hb-docs-demo demo="canonical-workbench-first-plan-angular">
</hb-docs-demo>

Hashbrown is an open source framework for building generative UI in Angular. You expose the components your application supports, describe their props with a schema, and let the model choose from that contract.

In this example, the model supplies a two-step plan. Our `SummaryCard` supplies the markup. Rendering the card creates a preview; it does not save the plan or perform its steps.

## Start with one component

The [Quickstart](/docs/angular/start/quick) builds this same card in an ordinary Angular app. We'll connect an endpoint, expose the component, and make our first request. There are no tools or application writes in that first lesson.

The recording adds the [conversation workbench](/docs/angular/start/workbench) around that component. Its inspector and bottom timeline let us follow the request, streamed values, and rendered UI together. You can build your own interface around the same Hashbrown APIs.

<img src="/video/docs/canonical-workbench-first-plan-angular-result.png" alt="The Angular first-plan workbench shows a completed two-step plan beside its trusted component contract and resolved props." width="1600" height="1000" loading="lazy" />

## Keep the same example as we learn

We'll keep the plan as we introduce each capability:

- [Messages and turns](/docs/angular/concept/ai-basics) follows a second request in the same conversation.
- [System instructions](/docs/angular/concept/system-instructions) separates the current user request from the policy our server owns.
- [Exposing components](/docs/angular/concept/components) adds an explicit **Accept plan** action.
- [Tool calling](/docs/angular/concept/functions) lets the model read the plan's current application state.
- [Structured output](/docs/angular/concept/structured-output) returns typed plan data for our own renderer.

Each lesson focuses on one change. We can inspect what the model returned, what Hashbrown rendered, and what our application actually changed.

Continue with the [Quickstart](/docs/angular/start/quick), or read [How Hashbrown works](/docs/angular/start/how-it-works) to follow the request from the browser to the provider and back.
