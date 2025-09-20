---
title: 'Converting Natural Language to Structured Data: Hashbrown React Docs'
meta:
  - name: description
    content: 'This recipe guides you through replacing complex form controls with natural language inputs. It leverages large-language models to parse your user''s natural language and convert it into structured data.'
---
# Converting Natural Language to Structured Data

This recipe guides you through replacing complex form controls with natural language inputs. It leverages large-language models to parse your user's natural language and convert it into structured data. This recipe also covers error handling strategies. You should be comfortable with:

- React functional components and hooks
- Basic Hashbrown setup (see **[Quick Start](/docs/react/start/quick)**)
- TypeScript

---

## 1. The legacy form (Expense report)

To make the example concrete, we will modernise an **Expense Report** form that collects:

- Amount (number)
- Currency (select with options resolved from `/api/currencies`)
- Category (select with options resolved from `/api/expense-categories`)
- Date (date picker)
- Description (text area)

<hb-code-example header="ExpenseForm.ts">

```tsx
interface ExpenseCategory {
  id: string;
  name: string;
}

interface Currency {
  code: string;
  symbol: string;
}

export function ExpenseForm() {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  useEffect(() => {
    fetch('/api/currencies')
      .then((r) => r.json())
      .then(setCurrencies);
    fetch('/api/expense-categories')
      .then((r) => r.json())
      .then(setCategories);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // submit to backend …
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8 }}>
      <input
        type="number"
        name="amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
      />

      <select
        name="currency"
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
      >
        <option value="">Select currency</option>
        {currencies.map((c) => (
          <option key={c.code} value={c.code}>
            {c.symbol} — {c.code}
          </option>
        ))}
      </select>

      <select
        name="category"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="">Select category</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>

      <input
        type="date"
        name="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <textarea
        value={description}
        name="description"
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
      />
      <button type="submit">Submit</button>
    </form>
  );
}
```

</hb-code-example>

Even with good UX, the form still requires **five** separate inputs, data fetching logic, and validation messages. Imagine localizing all of that and making it accessible!

---

## 2. Goal: one "smart" text box

Users should be able to type:

> "Team lunch in NYC, $42 USD on May 3rd"

or:

> "Almuerzo de equipo en Bogotá, 42 USD, categoría Comidas, el 3 de mayo"

or:

> "२७०० रुपये, प्रवास श्रेणी, १६ जून, बेंगळुरू ते पुणे विमान"

and the application should produce the same structured object the backend already expects.

We will get there with @hashbrownai/react!useStructuredCompletion:function and one helper tool.

---

## 3 Describe the result schema (success **or** error)

@hashbrownai/react!useStructuredCompletion:function needs a Skillet schema. We want two possible outcomes:

1. A **parsed expense**: When the LLM can successfully infer all of the information, it should emit an expense with `type = "Expense"`
2. An **error**: If the LLM cannot infer all of the information, we should give it a chance to tell the user with `type = "ParseError"`

Using `s.anyOf` with **literal** discriminators makes handling each case trivial on the React side:

<hb-code-example header="expenseSchema.ts">

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

Key Points:

1. Describe each case with its own schema
2. _Tag_ each case using `s.literal()` so that you can _discriminate_ on the result later
3. Use `s.infer` to produce TypeScript types from our schema
4. Join each branch using `s.anyOf`

---

## 4. Expose a tool so the LLM can see **valid categories**

The LLM must map free-form category names (e.g. "Comidas") onto the canonical IDs used by our backend.
To handle this, create a tool that returns the list of category names with their ID:

<hb-code-example header="useCategoryTool.tsx">

```ts
import { useTool } from '@hashbrownai/react';

export function useCategoryTool() {
  return useTool({
    name: 'listExpenseCategories',
    description: 'List valid expense categories the user can pick from',
    async handler(abortSignal) {
      const res = await fetch('/api/expense-categories', {
        signal: abortSignal,
      });
      const categories = res.json();

      return categories.map((category) => ({
        id: category.id,
        name: category.name,
      }));
    },
  });
}
```

</hb-code-example>

1. Use the @hashbrownai/react!useTool:function hook to expose the `listExpenseCategories` tool that the LLM can execute to follow instructions and respond to prompts.
2. The `handler` function receives an `AbortSignal` to potentially abort the fetch request.
3. Return the smallest shape necessary to guide the model (avoid verbose, unrelated data).

---

## 5. The natural-language component

<hb-code-example header="ExpenseNL.tsx">

```tsx
import React from 'react';
import { useStructuredCompletion } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { ExpenseResultSchema } from './expenseSchema';
import { useCategoryTool } from './useCategoryTool';

export function ExpenseNL({ onSubmit }: { onSubmit(expense: unknown): void }) {
  const [input, setInput] = useState('');
  const categoryTool = useCategoryTool();

  const completion = useStructuredCompletion({
    model: 'gpt-4.1',
    debugName: 'expense-nl',
    input, // drives the hook reactively
    tools: [categoryTool],
    system: `
      You are an accounting assistant. Convert the user's natural language 
      statement into a JSON object that matches the provided schema.
      * The user can speak in any language. Detect and handle it.
      * Call the "listExpenseCategories" tool to pick a category ID corresponds to the user's wording. 
      * If anything is missing or ambiguous, return a ParseError instead.
    `,
    schema: ExpenseResultSchema,
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    completion.reload();
  };

  useEffect(() => {
    const result = completion.output;
    if (!result) return;

    if (result.type === 'Expense') {
      onSubmit(result);
      setInput('');
    } else {
      alert(result.message);
    }
  }, [completion.output, onSubmit]);

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8 }}>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Describe your expense in any language…"
        rows={3}
      />
      <button
        type="submit"
        disabled={completion.isSending || completion.isReceiving}
      >
        {completion.isReceiving ? 'Parsing…' : 'Submit'}
      </button>
    </form>
  );
}
```

</hb-code-example>

Key points

1. `input` is a **single** free-text field.
2. The `system` prompt explicitly instructs the model how to behave and when to emit an error branch.
3. The categories tool is discoverable by the LLM; it can look up valid IDs on demand.
4. The root schema is `anyOf`, discriminated by `type` literals, making client logic trivial.
5. No client-side translation code is needed. Localisation falls out naturally.

---

## 6. Calling the same backend

Your API already expects the object produced by the old form, so no server changes are required:

```ts
app.post('/api/expenses', (req, res) => {
  // payload looks identical to legacy form submission
});
```

If you are not ready to remove the form, ship **both** components side-by-side, or use the completion
to fill out the existing form.

---

## 7. Progressive enhancement tips

- Use the success/error split to **fallback** to the old form when the model cannot parse.
- Set `debugName` to watch and debug the entire interaction in Redux DevTools.
- Show the parsed result to the user before submitting the form so that they can make necessary corrections.

---

## Recap

1. Identify the shape of your **structured data**.
2. Model **success** and **error** with `s.anyOf` + `s.literal` tags.
3. Expose API look-ups as tools so the LLM can stay in sync with your backend.
4. Swap multi-step UI for one **natural-language** input.
5. Enjoy happier users and effortless internationalisation.
