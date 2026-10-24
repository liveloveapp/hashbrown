---
title: 'Natural language forms: Hashbrown React Docs'
meta:
  - name: description
    content: 'Generate a typed form draft and apply it only after review and validation.'
---

# Natural language forms

Let's add a natural-language input to a form without giving the model control of submission. A request becomes a typed shopping-list draft. We review it, then select **Apply list** to replace the list in our application.

<hb-docs-demo demo="structured-form">
</hb-docs-demo>

## Before we start

Complete [Structured output](/docs/react/concept/structured-output). Its checked `StructuredList` component and shared shopping-list file are the complete implementation for this recipe. The [Streaming](/docs/react/concept/streaming) guide explains how the draft appears progressively.

Start with a small, explicit contract. Our example collects item names and quantities. It does not infer prices, purchase products, or submit a checkout.

## Keep three values separate

| Value        | Who changes it                                | Purpose                              |
| ------------ | --------------------------------------------- | ------------------------------------ |
| Request text | The user                                      | Describes the list to generate       |
| Draft list   | The model response, parsed by Hashbrown       | Shows the proposed replacement       |
| Applied list | The Apply handler after validation and review | Holds the application's current list |

Typing changes the request text. **Generate draft** starts a request. **Apply list** changes application state. Keeping these actions separate prevents every keystroke, partial response, or component render from submitting data.

## Generate and review

1. Enter **Add 2 apples and 1 loaf of bread**.
2. Select **Generate draft** and watch the complete items arrive.
3. Check the names and quantities against your request.
4. Select **Apply list** after the run finishes.

The applied list now contains the reviewed items. Generating another draft leaves that applied list in place until a valid replacement is explicitly accepted.

<img src="/video/docs/structured-form-result.png" alt="A generated shopping-list draft and the separately applied list both show two apples and one loaf of bread after review." width="920" height="564" loading="lazy" />

If the result is wrong, change the request and generate again. This small example does not include editable item fields. In a larger form, copy the completed draft into your existing editable controls, let the user correct it, and validate those edited values before submission.

## Validate the application rules

The shared validator requires 1–10 items, a trimmed name of 1–80 characters, and an integer quantity from 1–20. If the generated draft contains a zero quantity, our application rejects it and leaves the applied list unchanged. Zero matches the integer schema but fails our list rules. The recording fixture tests this case deterministically; a real model may instead correct the request or ask for clarification.

Prompt instructions help the model produce useful suggestions. They do not replace validation. The Apply handler revalidates the candidate instead of relying solely on whether the button is enabled.

If your form needs identifiers from the application, expose a narrow lookup through [Tool calling](/docs/react/concept/functions). Validate that a returned identifier still exists and that the current user may use it when saving. Do not accept a generated label as proof of a valid record or permission.

## Recover without losing accepted data

| Situation                          | Application behavior                                      |
| ---------------------------------- | --------------------------------------------------------- |
| Generation in progress             | Show the draft; keep Apply disabled.                      |
| Invalid quantity or missing data   | Explain the list rules; ask for a revised request.        |
| Endpoint or parse error            | Show the error; preserve the applied list.                |
| Cancelled generation               | Invalidate Apply immediately; allow a fresh request.      |
| Replacement run with no new answer | Keep the earlier applied list; do not reuse an old draft. |

For ambiguous input, ask the user to clarify. A more involved flow can use `s.anyOf` with literal tags for a draft or a clarification request; see [Skillet schemas](/docs/react/concept/schema). Do not silently guess a required amount, date, or identifier in a consequential form.

## Connect a real form

The example's applied list is local state. Refreshing the page clears it. For a server write, send the reviewed values to an authenticated endpoint, validate the body again, authorize the operation, and show saving and failure states. Keep the reviewed form available if the save fails. See [Securing a public endpoint](/docs/react/recipes/public-endpoint) for the server integration boundaries.

Keep an ordinary input path available where users need precise edits or cannot use the generated draft. Natural-language input can help fill a form; it does not remove the need for usable controls, labels, keyboard access, or explicit submission.

## Next steps

Use [Exposing components](/docs/react/concept/components) when the model should select from your trusted components. Use [Tool calling](/docs/react/concept/functions) when it needs application data, and [Message history](/docs/react/concept/message-history) if your form assistant should retain earlier turns.
