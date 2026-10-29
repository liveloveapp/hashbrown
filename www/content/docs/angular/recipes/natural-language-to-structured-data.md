---
title: 'Natural language forms: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Generate a two-step plan, review it in editable form fields, and explicitly apply validated values without conflating draft and application state.'
---

# Natural language forms

Let's use a prompt to fill a form. We'll generate a two-step plan, review it in ordinary editable fields, and apply the reviewed values. Generating a response will not submit the form for us.

<hb-workbench lesson="natural-forms">
</hb-workbench>

<img src="/video/docs/canonical-workbench-natural-forms-angular-result.png" alt="The Angular workbench shows generated plan data, editable reviewed fields, and a separately applied application plan with its revision." width="1600" height="1000" loading="lazy" />

## Keep the values separate

| Value | Who changes it | Purpose |
| --- | --- | --- |
| Request text | The user | Describes the desired plan. |
| Generated draft | The actual model response, parsed by Hashbrown | Proposes title and step values. |
| Reviewed fields | Review draft, then the user | Holds an editable application copy. |
| Applied plan | The validated Apply handler | Holds the application's accepted plan and revision. |

The workbench begins with the same application-owned two-step plan at revision zero. A new draft leaves that accepted data in place. Typing, parsing a partial response, or rendering a component does not apply a replacement.

## Generate, review, edit, apply

1. Open **Natural language forms** in the [canonical workbench](/docs/angular/start/workbench).
2. Send the first prompt. The read-only `readContext` tool returns the current application plan and revision.
3. Watch the JSON become a draft. **Review draft** stays disabled until the source successfully completes and the original document validates.
4. Select **Review draft** to copy that document into **Plan title**, **First step**, and **Second step**.
5. Edit the first step to **Outline the demo**. The applied plan has not changed.
6. Select **Apply plan**. The handler validates the reviewed values and advances the application revision.
7. Ask for a shorter second step. Inspect `readContext`: it returns the applied plan, including the edited first step.
8. Review the next draft. If the model rewrote the first step, restore **Outline the demo** in the field, then apply the reviewed values explicitly.

Both framework recordings use real OpenAI requests, real browser tool results, and their actual text and parser APIs. The model proposes data. It can rewrite a value we asked it to keep. That is why we review the next draft too. Our application owns the form and its actions.

## Validate both the document and the edits

The parser's preview is useful while the response arrives. A fresh successful source, completed parser, and valid original JSON are required before Review can create an actionable form copy.

The application then validates the edited fields again when applying:

- A trimmed title of 1–120 characters.
- Exactly two steps, each 1–200 trimmed characters.
- The same user turn and assistant source that produced the reviewed draft.
- The same application revision on which that draft was based.
- A successful current run, with no error, pending interrupt, recovery requirement, or earlier Apply for this turn.

The handler rechecks these rules. A disabled button is presentation, not the validation boundary. Whitespace-only or oversized edits stay editable and cannot replace the accepted plan.

A new generation invalidates the previous review. A cancelled, failed, replaced, or stale response cannot reuse a completed-looking draft. The existing applied plan remains available throughout.

## Use current application context

The browser tool reads the accepted plan without changing it. The server pins the tool declaration and instructs the model to preserve the applied first step during the follow-up, including edits made after the earlier model response.

This is application-provided context. It is not authorization for a server write. If your form saves to a backend, validate the reviewed values again, verify identity and ownership, and show saving and failure states. See [Securing a Public Endpoint](/docs/angular/recipes/public-endpoint).

Keep ordinary labelled inputs available. Users need a precise path to correct the generated draft; natural-language input does not replace usable controls or explicit submission.

## Inspect and replay

**Form** pairs the generated document with reviewed fields, the applied plan, and its revision. **Parser** shows actual parser values and the independent source lifecycle. **Requests** shows the browser tool result and the follow-up input.

Replay uses immutable captured values. It cannot edit fields, apply a plan, rerun a tool, or call the provider. Returning to live restores the current application view. This local example does not persist a form across a page refresh.

## Read the checked source

- [Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/authoring-workbench.ts) binds the actual SDK and framework parser.
- [Shared authoring contract](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-authoring.ts) defines the schema, original-document validation, and explicit review actions.
- [Capture and application guards](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench.ts) bind observations and Apply to the current request and revision.

Use [Structured output](/docs/angular/concept/structured-output) when you want the structured chat API to own parsing. Use [Streaming JSON Parser](/docs/angular/recipes/json-parser) for the direct parser boundary shown here, or [Exposing components](/docs/angular/concept/components) when the model should select trusted components.
