---
title: 'Migrate Chat to Threadplane: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Replace a custom Angular Hashbrown chatResource screen with Threadplane chat over the existing AG-UI server, with explicit policy, history, tool, and generated-UI migration steps.'
---

# Migrate chat presentation to Threadplane

<hb-docs-demo demo="canonical-workbench-threadplane-angular">
</hb-docs-demo>

The teaser shows the separately installed Threadplane client flow. Its provider output is scripted at the native Responses HTTP boundary; the UI and Hashbrown server adapter are real. It does not demonstrate every feature an existing chat screen may need.

Let's keep the Hashbrown server and replace our custom Angular chat screen with Threadplane's `<chat>`. The browser will use Threadplane's AG-UI adapter to talk to the same endpoint.

The [Threadplane recipe](/docs/angular/recipes/threadplane) includes the complete component, install command, theme, root element, and bootstrap code. Work through the boundaries below before removing an existing `chatResource` screen.

## 1. Replace one conversation owner

| Existing code                                                | Replacement                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `chatResource` and its template                              | A Threadplane AG-UI agent bound to `ChatComponent`.             |
| `provideHashbrown({ baseUrl: '/api/chat' })` for this screen | `provideAgent({ url: '/api/chat' })` from `@threadplane/ag-ui`. |
| Resource reads and send/stop buttons                         | `<chat [agent]="agent" />`, with `agent = injectAgent()`.       |
| Custom chat styling                                          | A Threadplane theme plus the application's layout.              |
| Hashbrown provider adapter on the server                     | Keep the server endpoint and AG-UI response stream.             |

Don't run both browser runtimes for the same visible conversation. A Hashbrown resource isn't the agent contract that `<chat>` accepts. Remove this screen's `chatResource` after its replacement works; keep `provideHashbrown` if other screens still use it.

The recipe provides the Threadplane agent at component scope. The adapter registers disposal with that injector's `DestroyRef`. Moving the provider into application configuration changes its lifetime: the conversation can then outlive the screen. Choose that scope deliberately rather than creating a new agent on each render or retaining an unwanted global conversation.

## 2. Move instructions before switching the UI

`provideAgent` configures the AG-UI connection. It has no Hashbrown `system` option. Instructions previously passed to `chatResource` won't appear automatically in the new requests.

Move required instructions and trusted application context into the server before replacing the screen. [Server request customization](/docs/angular/concept/transform-request-options) shows how to supply that context before the provider call.

Authentication, authorization, thread ownership, request limits, provider credentials, and model selection remain server responsibilities. Preserve those controls when changing browser adapters. A browser-supplied message, state field, or thread ID doesn't grant access. See [Public endpoint](/docs/angular/recipes/public-endpoint).

If your application uses custom request middleware, headers, or a transport, reconfigure that behavior explicitly for the new adapter. Hashbrown's browser configuration isn't copied into Threadplane's `provideAgent` call.

## 3. Migrate history through an explicit contract

A new Threadplane agent begins a new in-memory conversation unless you configure a supported restoration path. It doesn't discover the old Hashbrown resource's messages, local-storage records, or server threads.

Preserve your server's thread identity and owner checks. Decide how canonical text history will be loaded before enabling follow-up requests. Review [Message history](/docs/angular/concept/message-history) and the Threadplane adapter's replay/persistence contracts; don't treat an arbitrary saved Hashbrown object as Threadplane persistence data.

Keep display messages separate from canonical history. Provider continuation metadata, tool calls, and state may be required for a valid follow-up even when the chat doesn't display them. Verify restoration and the next request together.

## 4. Review tools and generated UI

| Feature                                 | Work required                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text streaming                          | Standard AG-UI text events drive the Threadplane chat. Verify your endpoint's success, error, and stop behavior.                                                               |
| Browser tools                           | Re-declare and validate them using the new adapter's client-tool contract, or retain an application-owned Hashbrown workflow separately. Existing handlers aren't transferred. |
| Server tools                            | Keep execution and authorization on the server. Display depends on the events your server emits.                                                                               |
| Structured output                       | Keep schema validation and application consumption. A structured object isn't automatically a chat message or generated component.                                             |
| Generated components                    | Hashbrown's component registry and UI schema aren't Threadplane view configuration. Keep the existing renderer or implement a separately validated mapping.                    |
| Interrupts, state, citations, subagents | Verify the exact backend events and configure the relevant adapter/UI contracts. A shared protocol doesn't supply every application feature automatically.                     |

Read [Functions](/docs/angular/concept/functions) before replacing tool execution, and [Components](/docs/angular/concept/components) before migrating generated UI. A visible tool card or approval control isn't an authorization boundary.

## 5. Verify the replacement

Send a first message and a follow-up through the same server. Confirm the trusted instructions, expected history, and thread identity in the request. Stop a stream, display a failed run, recover with an explicit action, and check that mounting an empty screen doesn't submit a message.

Verify any restored conversation, tools, and approvals before removing the old implementation. Check keyboard input, long replies, scrolling, and narrow layouts. Use the [complete Threadplane recipe](/docs/angular/recipes/threadplane) as the starting point, then add only the capabilities your backend and application actually support.

## Explore it in the workbench

The [Threadplane recipe](/docs/angular/recipes/threadplane) runs a separate installed consumer with the canonical inspector and timeline. Follow its Angular installation and mounting instructions, send a shipping question, and continue with a follow-up. This is not a `?lesson=` route in the hosted workbench.

Compare the first request, streamed reply, and follow-up history in **Requests**. **State** remains unchanged: this bounded text flow does not accept a plan or execute a business action. The scripted provider boundary makes the recorded exchange repeatable; it does not establish live provider access, storage migration, or support for the tool and generated-UI features listed above.
