---
title: 'Natural language forms: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Generate a typed form draft, edit a separate reviewed copy, and explicitly apply validated values.'
---

# Natural language forms

Natural-language input can give a form a useful first draft. A customer describes a trip; the model proposes a destination and duration; the customer corrects those fields before submitting. This works well when prose is easier to start with than a blank form, but precise controls still matter.

Keep generated data, editable fields, and submitted application state separate. A response arriving in the browser must not submit the form or overwrite edits made while generation was in progress.

<hb-diagram diagram="recipe-form-state-boundaries"> </hb-diagram>

## Generate a form draft

Start with the [Angular Quickstart](/docs/angular/start/quick). The following frontend example uses its configured Hashbrown provider and same-origin `/api/chat` endpoint. Keep the provider key and model configuration on the server. Create resources in an Angular injection context; the component below supplies one.

```ts
import { Component, signal } from '@angular/core';
import { s } from '@hashbrownai/core';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { reviewTrip } from './review-trip';

export const tripSchema = s.object('A trip draft for user review', {
  destination: s.string('The destination city'),
  days: s.integer('Number of days'),
});

@Component({
  selector: 'app-trip-draft',
  template: `
    <button [disabled]="result.isLoading()" (click)="generate()">
      Generate trip draft
    </button>
    @if (result.error()) {
      <p role="alert">Generation failed. Try again.</p>
    } @else {
      <pre>{{ preview() }}</pre>
    }
    <button [disabled]="!canReview()" (click)="review()">Review draft</button>
    @if (reviewed(); as fields) {
      <fieldset [disabled]="result.isLoading()">
        <label
          >Destination
          <input
            #destination
            [value]="fields.destination"
            (input)="edit(destination.value, fields.days)"
        /></label>
        <label
          >Days
          <input
            #days
            type="number"
            [value]="fields.days"
            (input)="edit(fields.destination, days.valueAsNumber)"
        /></label>
        <button (click)="apply()">Apply</button>
      </fieldset>
    }
    <p>
      Applied trip: {{ applied()?.destination ?? 'None' }} ·
      {{ applied()?.days }}
    </p>
  `,
})
export class TripDraft {
  readonly input = signal<{ id: string; text: string } | null>(null);
  readonly reviewed = signal<{
    sourceId: string;
    destination: string;
    days: number;
  } | null>(null);
  readonly applied = signal<ReturnType<typeof reviewTrip>>(null);
  readonly result = structuredCompletionResource({
    input: this.input,
    schema: tripSchema,
    system: 'Extract a trip draft. Never submit or book anything.',
  });
  preview() {
    return JSON.stringify(this.result.value(), null, 2);
  }
  canReview() {
    return (
      !this.result.isLoading() &&
      !this.result.error() &&
      this.result.lastRunFinishReason() === 'stop' &&
      this.input() !== null
    );
  }
  generate() {
    this.reviewed.set(null);
    this.input.set({ id: crypto.randomUUID(), text: 'Three days in Lisbon' });
  }
  review() {
    if (!this.canReview()) return;
    const draft = reviewTrip(this.result.value());
    const source = this.input();
    if (this.canReview() && draft && source)
      this.reviewed.set({ ...draft, sourceId: source.id });
  }
  edit(destination: string, days: number) {
    this.reviewed.update((fields) =>
      fields ? { ...fields, destination, days } : null,
    );
  }
  apply() {
    const fields = this.reviewed();
    const trip = reviewTrip(fields);
    if (this.canReview() && trip && fields?.sourceId === this.input()?.id) {
      this.applied.set(trip);
      this.reviewed.set(null);
    }
  }
}
```

The completion starts with `null`, so mounting makes no request. The preview can change while generation runs. The structured completion API owns parsing here. Enable **Review draft** only after a fresh successful completion, validate the completed structured value, then copy its values into editable fields. The workbench below demonstrates a separate text-and-parser implementation that also validates the original JSON document. For this form, require a trimmed destination of 1–120 characters and an integer duration from 1 through 14.

Create `review-trip.ts` with this application helper. It validates both a generated draft and the user’s edited values. It defines the boundary independently of the component library:

```ts
export function reviewTrip(
  value: unknown,
): { destination: string; days: number } | null {
  if (typeof value !== 'object' || value === null) return null;
  const trip = value as Record<string, unknown>;
  if (typeof trip.destination !== 'string' || typeof trip.days !== 'number')
    return null;
  const destination = trip.destination.trim();
  return destination.length > 0 &&
    destination.length <= 120 &&
    Number.isInteger(trip.days) &&
    trip.days >= 1 &&
    trip.days <= 14
    ? { destination, days: trip.days }
    : null;
}
```

The labelled inputs change only the reviewed copy. **Apply** validates it again and consumes that review. The source ID ties the fields to the current request; generating again discards the old review. This example has one local editor. Add an application revision check if another screen or client can change the accepted trip. A backend save must repeat value validation and check identity and ownership.

## Explore it in the workbench

The workbench below replays a recorded run of this lesson.

<hb-workbench lesson="natural-forms">
</hb-workbench>

Let's use a prompt to fill a form. We'll generate a two-step plan, review it in ordinary editable fields, and apply the reviewed values. Generating a response will not submit the form for us.

## Keep the values separate

| Value           | Who changes it                                 | Purpose                                             |
| --------------- | ---------------------------------------------- | --------------------------------------------------- |
| Request text    | The user                                       | Describes the desired plan.                         |
| Generated draft | The actual model response, parsed by Hashbrown | Proposes title and step values.                     |
| Reviewed fields | Review draft, then the user                    | Holds an editable application copy.                 |
| Applied plan    | The validated Apply handler                    | Holds the application's accepted plan and revision. |

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

The replays for both frameworks use real OpenAI requests, real browser tool results, and their actual text and parser APIs. The model proposes data. It can rewrite a value we asked it to keep. That is why we review the next draft too. Our application owns the form and its actions.

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
