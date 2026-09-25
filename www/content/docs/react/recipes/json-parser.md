---
title: 'Streaming JSON Parser in React: Hashbrown React Docs'
meta:
  - name: description
    content: 'Use Hashbrown useJsonParser and useImperativeJsonParser to parse partial JSON as it streams and resolve typed values with Skillet schemas.'
---

# Streaming JSON Parser in React

Hashbrown's JSON parser incrementally parses JSON as text streams in. It powers structured output and generative UI internally, and you can use it directly when your app receives a JSON stream from any source.

Use the parser when you need to:

- Render partial structured data before a response is complete.
- Inspect open and closed JSON nodes while a stream is still growing.
- Preserve object identity for unchanged branches.
- Resolve parser state into typed values with Skillet schemas.

---

## 1. Parse a Growing JSON String

`useJsonParser()` is prop-driven: pass the full JSON string you have so far. Hashbrown keeps the parser session alive and only parses the appended chunk when the string grows by prefix.

<hb-code-example header="WeatherPreview.tsx">

```tsx
import { useJsonParser } from '@hashbrownai/react';

export function WeatherPreview({ json }: { json: string }) {
  const { value, error, parserState } = useJsonParser<{
    city?: string;
    forecast?: string;
  }>(json);

  if (error) {
    return <p>Could not parse the response.</p>;
  }

  return (
    <section>
      <p>{value?.city ?? 'Reading city...'}</p>
      <p>{value?.forecast ?? 'Reading forecast...'}</p>
      <small>{parserState.isComplete ? 'Complete' : 'Streaming'}</small>
    </section>
  );
}
```

</hb-code-example>

When no schema is provided, `value` is the parser state's best resolved root value.

---

## 2. Resolve with a Skillet Schema

Pass a schema when you want typed values and partial matching behavior that follows Skillet's streaming rules.

<hb-code-example header="WeatherPreview.tsx">

```tsx
import { s } from '@hashbrownai/core';
import { useJsonParser } from '@hashbrownai/react';

const schema = s.object('Weather summary', {
  city: s.string('City name'),
  forecast: s.streaming.string('Forecast text'),
  alerts: s.streaming.array(
    'Weather alerts',
    s.object('Alert', {
      title: s.string('Alert title'),
      severity: s.enumeration('Severity', ['low', 'medium', 'high']),
    }),
  ),
});

export function WeatherPreview({ json }: { json: string }) {
  const { value, error } = useJsonParser(json, schema);

  if (error) {
    return <p>Could not parse the response.</p>;
  }

  return (
    <section>
      <h2>{value?.city ?? 'Weather'}</h2>
      <p>{value?.forecast ?? ''}</p>
      <ul>
        {(value?.alerts ?? []).map((alert) => (
          <li key={alert.title}>
            {alert.title} ({alert.severity})
          </li>
        ))}
      </ul>
    </section>
  );
}
```

</hb-code-example>

`s.streaming.string()`, `s.streaming.array()`, and `s.streaming.object()` allow useful partial values while the JSON is incomplete.

---

## 3. Inspect Parser State

`parserState` contains a normalized JSON AST. Every node has a `closed` flag, so your UI can distinguish complete values from values that are still open in the stream.

<hb-code-example header="ParserInspector.tsx">

```tsx
import { useJsonParser } from '@hashbrownai/react';

export function ParserInspector({ json }: { json: string }) {
  const { parserState } = useJsonParser(json);
  const root =
    parserState.rootId === null ? null : parserState.nodes[parserState.rootId];

  return (
    <pre>
      {JSON.stringify(
        {
          complete: parserState.isComplete,
          rootType: root?.type,
          rootClosed: root?.closed,
          nodeCount: Object.keys(parserState.nodes).length,
        },
        null,
        2,
      )}
    </pre>
  );
}
```

</hb-code-example>

Hashbrown preserves node and resolved value identity for unchanged branches. This lets React avoid unnecessary work when only one branch of a large JSON object continues streaming.

---

## 4. Use `s.node()` for Generative UI Props

`s.node(inner)` resolves the current JSON parser node along with the inner value. Hashbrown uses this for component props that need to know whether a nested value is complete.

<hb-code-example header="schema.ts">

```ts
import { s } from '@hashbrownai/core';

export const markdownComponentSchema = s.object('Markdown component', {
  children: s.node(s.streaming.string('Markdown content')),
});
```

</hb-code-example>

The resolved node includes the parsed value plus node metadata such as completion state. This is useful for fallback components and renderers that need to behave differently while nested props are still streaming.

---

## 5. Parse Imperatively

Use `useImperativeJsonParser()` when chunks arrive as events and you do not want to concatenate the source string in React state.

<hb-code-example header="StreamReader.tsx">

```tsx
import { useEffect } from 'react';
import { useImperativeJsonParser } from '@hashbrownai/react';

export function StreamReader({ stream }: { stream: ReadableStream<string> }) {
  const parser = useImperativeJsonParser<{ answer?: string }>();

  useEffect(() => {
    const reader = stream.getReader();
    let cancelled = false;

    async function read() {
      while (!cancelled) {
        const result = await reader.read();
        if (result.done) {
          return;
        }

        parser.parseChunk(result.value);
      }
    }

    read();

    return () => {
      cancelled = true;
      reader.releaseLock();
    };
  }, [parser, stream]);

  return <pre>{JSON.stringify(parser.value, null, 2)}</pre>;
}
```

</hb-code-example>

Prefer `useJsonParser()` when your component already owns the full string. Prefer the imperative parser when the stream reader is the source of truth.
