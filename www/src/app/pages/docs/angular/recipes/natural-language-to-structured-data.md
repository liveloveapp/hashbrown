---
title: 'Converting Natural Language to Structured Data: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'This recipe shows how to replace complex form controls with a single natural-language input in Angular. We use a large-language model to parse what the user types and convert it into structured data that your backend already expects.'
---
# Converting Natural Language to Structured Data

This recipe shows how to replace complex form controls with a single natural-language input in Angular. We use a large-language model to parse what the user types and convert it into structured data that your backend already expects. You should be comfortable with:

- Standalone Angular components and signals
- Basic Hashbrown Angular setup (see **[Quick Start](/docs/angular/start/quick)**)
- TypeScript

---

## 1. The legacy form (Expense report)

To make the example concrete, we will modernise an **Expense Report** form that collects:

- Amount (number)
- Currency (select with options resolved from `/api/currencies`)
- Category (select with options resolved from `/api/expense-categories`)
- Date (date picker)
- Description (text area)

<hb-code-example header="expense-form.component.ts">

```ts
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ExpenseCategory {
  id: string;
  name: string;
}

interface Currency {
  code: string;
  symbol: string;
}

@Component({
  selector: 'app-expense-form',
  imports: [CommonModule],
  template: `
    <form (submit)="onSubmit($event)" style="display: grid; gap: 8px">
      <input
        type="number"
        name="amount"
        [value]="amount()"
        (input)="amount.set(($event.target as HTMLInputElement).value)"
        placeholder="Amount"
      />

      <select
        name="currency"
        [value]="currency()"
        (change)="currency.set(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Select currency</option>
        @for (c of currencies(); track c.code) {
          <option [value]="c.code">{{ c.symbol }} — {{ c.code }}</option>
        }
      </select>

      <select
        name="category"
        [value]="categoryId()"
        (change)="categoryId.set(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Select category</option>
        @for (cat of categories(); track cat.id) {
          <option [value]="cat.id">{{ cat.name }}</option>
        }
      </select>

      <input
        type="date"
        name="date"
        [value]="date()"
        (input)="date.set(($event.target as HTMLInputElement).value)"
      />

      <textarea
        name="description"
        [value]="description()"
        (input)="description.set(($event.target as HTMLTextAreaElement).value)"
        placeholder="Description"
      ></textarea>

      <button type="submit">Submit</button>
    </form>
  `,
})
export class ExpenseFormComponent {
  amount = signal('');
  currency = signal('');
  categoryId = signal('');
  date = signal('');
  description = signal('');

  currencies = signal<Currency[]>([]);
  categories = signal<ExpenseCategory[]>([]);

  constructor() {
    this.loadLookups();
  }

  private async loadLookups() {
    const [currenciesRes, categoriesRes] = await Promise.all([
      fetch('/api/currencies'),
      fetch('/api/expense-categories'),
    ]);
    const [currencies, categories] = await Promise.all([
      currenciesRes.json(),
      categoriesRes.json(),
    ]);
    this.currencies.set(currencies);
    this.categories.set(categories);
  }

  onSubmit(e: SubmitEvent) {
    e.preventDefault();
    // submit to backend...
  }
}
```

</hb-code-example>

Even with good UX, the form requires **five** separate inputs, multiple data fetches, and validation handling. Now imagine localizing all of that and making it accessible.

---

## 2. Goal: one "smart" text box

Users should be able to type:

> "Team lunch in NYC, $42 USD on May 3rd"

or:

> "Almuerzo de equipo en Bogotá, 42 USD, categoría Comidas, el 3 de mayo"

or:

> "२७०० रुपये, प्रवास श्रेणी, १६ जून, बेंगळुरू ते पुणे विमान"

and the application should produce the same structured object the backend already expects.

We will get there with @hashbrownai/angular!structuredCompletionResource:function and one helper tool.

---

## 3. Describe the result schema (success **or** error)

@hashbrownai/angular!structuredCompletionResource:function needs a Skillet schema. We want two possible outcomes:

1. A parsed expense: When the LLM can infer everything, it should emit an expense with `type = "Expense"`.
2. An error: If the LLM cannot infer something, it should emit a `type = "ParseError"` with a helpful message.

Using `s.anyOf` with literal discriminators makes handling each case trivial in Angular:

<hb-code-example header="expense-schema.ts">

```ts
import { s } from '@hashbrownai/core';

export const ExpenseResultSuccessSchema = s.object('Parsed expense', {
  type: s.literal('Expense'),
  amount: s.number('The amount of the expense'),
  currency: s.string('ISO 4217 currency code, e.g. USD'),
  categoryId: s.string('ID of the chosen category'),
  date: s.string('ISO date YYYY-MM-DD'),
  description: s.string('Short description'),
});

export type ExpenseResultSuccess = s.infer<typeof ExpenseResultSuccessSchema>;

export const ExpenseResultParseErrorSchema = s.object('Unable to parse', {
  type: s.literal('ParseError'),
  message: s.string('Human readable error'),
});

export type ExpenseResultParseError = s.infer<
  typeof ExpenseResultParseErrorSchema
>;

export const ExpenseResultSchema = s.anyOf([
  ExpenseResultSuccessSchema, // Success branch
  ExpenseResultParseErrorSchema, // Error branch
]);
```

</hb-code-example>

1. Describe each case with its own schema
2. _Tag_ each case using `s.literal()` so you can discriminate on the result later
3. Use `s.infer` to produce TypeScript types from your schema
4. Join branches with `s.anyOf`

---

## 4. Expose a tool so the LLM can see valid categories

The LLM must map free-form category names (e.g. "Comidas") onto the canonical IDs used by your backend. Create a tool that returns the list of category names with their ID:

<hb-code-example header="category-tool.ts">

```ts
import { createTool } from '@hashbrownai/angular';

export const listExpenseCategories = createTool({
  name: 'listExpenseCategories',
  description: 'List valid expense categories the user can pick from',
  async handler(abortSignal) {
    const res = await fetch('/api/expense-categories', { signal: abortSignal });
    const categories = await res.json();

    return categories.map((category: { id: string; name: string }) => ({
      id: category.id,
      name: category.name,
    }));
  },
});
```

</hb-code-example>

1. Use @hashbrownai/angular!createTool:function to expose the `listExpenseCategories` tool that the LLM can execute to follow instructions and respond to prompts.
2. The `handler` function receives an `AbortSignal` to potentially abort the fetch request.
3. Return the smallest shape necessary to guide the model (avoid verbose, unrelated data).

---

## 5. The natural‑language component

<hb-code-example header="expense-nl.component.ts">

```ts
import { Component, effect, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { ExpenseResultSchema, ExpenseResultSuccess } from './expense-schema';
import { listExpenseCategories } from './category-tool';

@Component({
  selector: 'app-expense-nl',
  imports: [CommonModule],
  template: `
    <form (submit)="onSubmit($event)" style="display: grid; gap: 8px">
      <textarea
        [value]="inputText()"
        (input)="inputText.set(($event.target as HTMLTextAreaElement).value)"
        placeholder="Describe your expense in any language…"
        rows="3"
      ></textarea>
      <button type="submit" [disabled]="completion.isLoading()">
        {{ completion.isLoading() ? 'Parsing…' : 'Submit' }}
      </button>
    </form>
  `,
})
export class ExpenseNlComponent {
  // Emits the parsed expense to the parent when successful
  expenseParsed = output<ExpenseResultSuccess>();

  inputText = signal('');
  private requestInput = signal<string | null>(null);

  completion = structuredCompletionResource({
    model: 'gpt-4.1',
    debugName: 'expense-nl',
    input: this.requestInput,
    tools: [listExpenseCategories],
    system: `
      You are an accounting assistant. Convert the user's natural language
      statement into a JSON object that matches the provided schema.
      * The user can speak in any language. Detect and handle it.
      * Call the "listExpenseCategories" tool to pick a category ID that
        corresponds to the user's wording.
      * If anything is missing or ambiguous, return a ParseError instead.
    `,
    schema: ExpenseResultSchema,
  });

  constructor() {
    effect(() => {
      const result = this.completion.value();
      if (!result) return;

      if (result.type === 'Expense') {
        this.expenseParsed.emit(result as ExpenseResultSuccess);
        this.inputText.set('');
        this.requestInput.set(null);
      } else {
        alert(result.message);
      }
    });
  }

  onSubmit(e: SubmitEvent) {
    e.preventDefault();
    // Trigger a new completion run with the current input
    this.requestInput.set(this.inputText());
  }
}
```

</hb-code-example>

Key points

1. `inputText` is a **single** free‑text field bound to a signal.
2. The `system` prompt instructs the model how to behave and when to emit an error branch.
3. The categories tool is discoverable by the LLM; it can look up valid IDs on demand.
4. The root schema is `anyOf`, discriminated by `type` literals, making client logic trivial.
5. No client‑side translation code is needed. Localisation falls out naturally.

---

## 6. Calling the same backend

Your API already expects the object produced by the old form, so no server changes are required:

```ts
app.post('/api/expenses', (req, res) => {
  // payload looks identical to legacy form submission
});
```

If you are not ready to remove the form, ship both components side‑by‑side, or use the completion to fill out the existing form.

---

## 7. Progressive enhancement tips

- Fallback: Use the success/error split to fallback to the old form when the model cannot parse.
- `debugName`: Set `debugName` to make signal names readable in logs and to aid debugging.
- Confirm: Show the parsed result to the user before submitting so they can make corrections.

---

## Recap

1. Identify the shape of your structured data.
2. Model success and error with `s.anyOf` + `s.literal` tags.
3. Expose API look‑ups as tools so the LLM can stay in sync with your backend.
4. Swap multi‑step UI for one natural‑language input using `structuredCompletionResource`.
5. Enjoy happier users and effortless internationalisation.
