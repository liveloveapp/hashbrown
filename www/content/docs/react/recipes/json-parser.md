---
title: 'Streaming JSON Parser: Hashbrown React Docs'
meta:
  - name: description
    content: 'Preview a growing JSON document with the framework parser and validate the completed source before using it.'
---

# Streaming JSON Parser

<hb-docs-demo demo="canonical-workbench-json-parser-react">
</hb-docs-demo>

A streaming JSON parser resolves useful values before the whole document arrives. Use it for a JSON source you already own: a text response, a socket, or an imported file. Choose streaming strings for fields that can display a prefix, and ordinary strings for fields that should wait for a closing quote.

Let’s preview a shopping list. The parser will receive the full JSON string so far. The preview helps the user read; a separate check of the original completed document decides whether it can be used. If you already use structured chat, consume its parsed content directly.

<hb-diagram diagram="recipe-parser-preview-validation"> </hb-diagram>

## Preview an existing JSON source

This component does not make a model request. Its parent owns the source, passes the accumulated JSON string, and tracks successful completion separately. Create `shopping-schema.ts`:

```ts
import { s } from '@hashbrownai/core';

export const shoppingSchema = s.object('A shopping list', {
  title: s.string('A concise list title'),
  items: s.streaming.array('Items to buy', s.streaming.string('An item name')),
});
```

Then create the preview component:

```tsx
import { useJsonParser } from '@hashbrownai/react';
import { shoppingSchema } from './shopping-schema';

export function ShoppingPreview({ json }: { json: string }) {
  const parser = useJsonParser(json, shoppingSchema);
  if (parser.error) return <p role="alert">Invalid shopping list.</p>;
  return (
    <section aria-label="Shopping list preview">
      <h2>{parser.value?.title ?? 'Preparing list…'}</h2>
      <ul>
        {parser.value?.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
```

Pass a growing prefix such as `{"title":"Groceries","items":["ap` and then the full document. The title waits for its closing quote; the item can appear as a prefix. Replacing the string with a different document resets parsing. Before enabling a save action, require successful source completion and reparse the original JSON with the complete application contract. A closed root, a retained parser value, and a successful source are separate observations.

## Explore it in the workbench

<hb-workbench lesson="json-parser">
</hb-workbench>

Let's watch JSON become a plan. The title waits for a complete string, while step text grows as it arrives. Then we'll check the original document before calling the result complete.

<img src="/video/docs/canonical-workbench-json-parser-react-result.png" alt="The React workbench pairs the plan preview with actual parser observations, the original JSON, and final validation." width="1600" height="1000" loading="lazy" />

## Follow the JSON

1. Open **JSON parser** in the [canonical workbench](/docs/react/start/workbench).
2. Send the first prompt and inspect **JSON** as the actual OpenAI response arrives.
3. Switch to **Parser**. Compare the resolved values with source and parser completion.
4. After the source finishes, inspect the validated original document.
5. Ask for a shorter second step. The parser follows the new assistant response rather than appending it to the old JSON document.
6. Replay the two turns. Chat, raw JSON, resolved values, and the bottom timeline follow the same selected event.

The recording uses real OpenAI output through the actual Hashbrown text SDK. `useJsonParser` receives the accumulated assistant JSON. There is no browser timer generating replacement model tokens.

## Choose which values can stream

The shared Skillet schema uses an ordinary title string and streaming step strings:

<hb-code-example header="Plan parser schema">

```ts
const schema = s.object('A two-step plan', {
  title: s.string('A concise plan title'),
  steps: s.streaming.array(
    'Exactly two steps',
    s.streaming.string('A concise action'),
  ),
});
```

</hb-code-example>

The title waits for its closing quote. A step can resolve to a useful string prefix before its closing quote arrives. The surrounding array can reveal values while the document is still incomplete.

These choices describe what our application can display as a preview. They do not prove the source will finish successfully. See [Skillet](/docs/react/concept/schema) for field resolution behavior.

## Keep three completion checks separate

| Check                        | What it tells us                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Source lifecycle             | Whether the actual SDK run is generating, successfully finished, stopped, or failed.                                 |
| Parser completion            | Whether the parser has completed its JSON root.                                                                      |
| Original document validation | Whether parsing and validating the complete original JSON succeeds, including required fields and application rules. |

A JSON root can close before the source ends. A stopped source can leave useful partial values. A streaming array can withhold an invalid member, and a parser may retain its last resolved value after an error. None of these is a completed valid plan by itself.

At the final boundary, the shared helper reparses the **original JSON**, then checks the required title and exactly two nonempty steps. This catches missing fields and members that a preview might withhold. Errors hide stale successful-looking previews; stopped partials remain labelled stopped.

## Bind the real parser

The React client derives the current assistant's raw JSON from actual SDK messages and passes it to `useJsonParser` with the shared schema. It captures the parser's resolved value, completion flag, and error separately from the SDK lifecycle.

The input is the full string so far. A growing prefix continues the parser session; replacing the string starts a new document. The client binds observations to the current user turn and assistant message ID, so a late value from an older request cannot become the new draft.

The standalone parser also works with a finite file, socket, or other JSON source. This workbench uses a model response so the transport, source, and parser can be inspected together. If you already use a structured chat API, consume its parsed content directly rather than parsing that typed value again.

## Stop and recover

Stop aborts the actual SDK request and makes that result ineligible for application actions. A fresh request gets a new captured origin. Endpoint errors, malformed JSON, unsupported types, omitted fields, and truncated output remain visible as separate outcomes.

The parser lesson never applies a plan. Application revision stays at zero. Replay uses the stored observations; it does not feed old chunks back into the live parser, start requests, or change state.

## Read the checked source

- [React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/AuthoringWorkbench.tsx) binds the actual SDK and framework parser.
- [Shared authoring contract](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-authoring.ts) defines the schema, original-document validation, and explicit review actions.
- [Capture and application guards](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench.ts) bind observations and Apply to the current request and revision.

Continue with [Natural language forms](/docs/react/recipes/natural-language-to-structured-data) to copy a completed draft into editable controls and apply it explicitly.
