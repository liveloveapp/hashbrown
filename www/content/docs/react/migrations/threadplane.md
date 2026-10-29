---
title: 'Migrate Chat to Threadplane: Hashbrown React Docs'
meta:
  - name: description
    content: 'Replace a custom Hashbrown React text transcript and composer with Threadplane source components while preserving runtime, server policy, and explicit migration boundaries.'
---

# Migrate chat presentation to Threadplane

<hb-docs-demo demo="canonical-workbench-threadplane-react">
</hb-docs-demo>

The teaser shows the separately installed Threadplane client flow. Its provider output is scripted at the native Responses HTTP boundary; the UI and Hashbrown server adapter are real. It does not demonstrate every feature an existing chat screen may need.

We can replace the transcript and composer in a Hashbrown chat screen while keeping `useChat` and the existing server. Let's make that change first, then check the features around it.

The [Threadplane recipe](/docs/react/recipes/threadplane) contains the complete component, mounting code, and local source-package setup. At the referenced revision, the React components are private source packages; follow those build and local-install steps rather than assuming an npm registry package exists.

## 1. Keep the conversation owner

Find the component that calls `useChat`. Keep that hook and its existing `system`, tools, transport, and thread configuration. Replace the presentation around it.

| Existing code                         | Replacement                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Custom user/assistant text loop       | `TextTranscript` from `@threadplane/react/chat`, with stable message IDs and string content. |
| Custom message form                   | `ChatInput`, with `onSubmit` calling `chat.sendMessage`.                                     |
| Custom cancel button                  | `ChatInput`'s `onStop`, calling `chat.stop` during an active run.                            |
| Loading flag                          | `busy` derived from `isSending`, `isReceiving`, `isGenerating`, and `isLoading`.             |
| Existing provider and server endpoint | Keep `HashbrownProvider` and `/api/chat`.                                                    |

Don't cast the result of `useChat` to a Threadplane `AgentSession`. These have different execution, subscription, snapshot, and completion contracts. The recipe composes text components directly and doesn't need that bridge.

Keep the hook's owner mounted while retaining an in-memory conversation. Moving the hook into a different component or replacing the mounted owner creates a new runtime; the presentation change doesn't transfer the old instance's history.

## 2. Preserve the server boundary

Keep authentication, authorization, thread ownership, provider credentials, and model selection in the server. The UI migration doesn't change who may read a thread or execute an action. See [Public endpoint](/docs/react/recipes/public-endpoint).

The existing browser `system` option still reaches the Hashbrown runtime in this composition. It remains model guidance, not trusted permission. Pin trusted instructions and context on the server using [request customization](/docs/react/concept/transform-request-options).

Keep any authentication middleware and custom transport behavior that your current `HashbrownProvider` uses. Changing the transcript doesn't require a new endpoint or a second HTTP client.

## 3. Plan history explicitly

The recipe retains history through the same `useChat` instance and `sendMessage` calls. It doesn't add browser storage, server persistence, or a new thread identifier. Preserve your existing thread ownership and save/restore flow.

`TextTranscript` receives a display projection. Keep the canonical messages in Hashbrown; don't replace them with the filtered rows. Activities, tool records, and provider continuation data can matter to later requests even when this text view doesn't display them. Review [Message history](/docs/react/concept/message-history) before importing, exporting, or changing saved records.

## 4. Account for tools and generated components

| Feature                                      | Work required                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text replies                                 | The recipe selects user/assistant strings and renders them literally. Markdown punctuation stays visible.                                                     |
| Client tools                                 | Keep the Hashbrown tool definitions and handlers on the existing runtime. Add explicit presentation for tool activity when needed.                            |
| Server tools                                 | Keep server execution and authorization. A text transcript doesn't supply tool cards or approval controls.                                                    |
| Structured output                            | Retain schema validation and application rendering; structured objects aren't transcript strings.                                                             |
| Generated components                         | Keep the trusted registry and Hashbrown rendering path, or design a separate validated renderer. Threadplane text rows don't translate component definitions. |
| Citations, reasoning, activities, interrupts | Select and render each capability deliberately. The small text composition doesn't include these views.                                                       |

Review [Functions](/docs/react/concept/functions) before moving a tool, and [Components](/docs/react/concept/components) before changing generated UI. A rendered control doesn't itself authorize a tool call or resume an interrupted run.

## 5. Verify before removing the old screen

Send a message, wait for streaming output, and send a follow-up. Confirm the expected history reaches the same endpoint. Stop a response, recover from a failed request with an explicit send, and confirm that merely mounting the screen sends nothing.

With the tested Hashbrown **0.8.0** client, Stop cancels the request and the unfinished assistant reply is removed; completed turns remain. Account for that behavior if your existing screen retains an interrupted draft.

Check long text and narrow viewports. The recipe uses Threadplane's composer stylesheet, while `TextTranscript` presents literal text without automatic scrolling or token announcements. Add application behavior where your product needs it.

Keep the existing screen until the features your users rely on have equivalent behavior. The [complete recipe](/docs/react/recipes/threadplane) is a bounded text conversation, so use its feature boundaries as a checklist for your application.

## Explore it in the workbench

The [Threadplane recipe](/docs/react/recipes/threadplane) runs a separate installed consumer with the canonical inspector and timeline. Follow its React installation and mounting instructions, send a shipping question, and continue with a follow-up. This is not a `?lesson=` route in the hosted workbench.

Compare the first request, streamed reply, and follow-up history in **Requests**. **State** remains unchanged: this bounded text flow does not accept a plan or execute a business action. The scripted provider boundary makes the recorded exchange repeatable; it does not establish live provider access, storage migration, or support for the tool and generated-UI features listed above.
