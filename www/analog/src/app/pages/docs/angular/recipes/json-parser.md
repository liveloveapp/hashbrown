---
title: 'Streaming JSON Parser in Angular: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Use Hashbrown injectJsonParser and injectImperativeJsonParser to parse partial JSON as it streams and resolve typed values with Skillet schemas.'
---

# Streaming JSON Parser in Angular

Hashbrown's JSON parser incrementally parses JSON as text streams in. It powers structured output and generative UI internally, and you can use it directly when your app receives a JSON stream from any source.

Use the parser when you need to:

- Render partial structured data before a response is complete.
- Inspect open and closed JSON nodes while a stream is still growing.
- Preserve object identity for unchanged branches.
- Resolve parser state into typed values with Skillet schemas.

---

## 1. Parse a Growing JSON Signal

`injectJsonParser()` is signal-driven: pass a signal containing the full JSON string you have so far. Hashbrown keeps the parser session alive and only parses the appended chunk when the string grows by prefix.

<hb-code-example header="weather-preview.component.ts">

```ts
import { Component, input } from '@angular/core';
import { injectJsonParser } from '@hashbrownai/angular';

@Component({
  selector: 'app-weather-preview',
  template: `
    @if (parser.error()) {
      <p>Could not parse the response.</p>
    } @else {
      <section>
        <pre>{{ parser.value() | json }}</pre>
        <small>{{
          parser.parserState().isComplete ? 'Complete' : 'Streaming'
        }}</small>
      </section>
    }
  `,
})
export class WeatherPreview {
  json = input.required<string>();
  parser = injectJsonParser(this.json);
}
```

</hb-code-example>

When no schema is provided, `value()` is the parser state's best resolved root value.

---

## 2. Resolve with a Skillet Schema

Pass a schema when you want typed values and partial matching behavior that follows Skillet's streaming rules.

<hb-code-example header="weather-preview.component.ts">

```ts
import { Component, input } from '@angular/core';
import { s } from '@hashbrownai/core';
import { injectJsonParser } from '@hashbrownai/angular';

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

@Component({
  selector: 'app-weather-preview',
  template: `
    @if (parser.error()) {
      <p>Could not parse the response.</p>
    } @else {
      <section>
        <h2>{{ parser.value()?.city ?? 'Weather' }}</h2>
        <p>{{ parser.value()?.forecast ?? '' }}</p>
        <ul>
          @for (alert of parser.value()?.alerts ?? []; track alert.title) {
            <li>{{ alert.title }} ({{ alert.severity }})</li>
          }
        </ul>
      </section>
    }
  `,
})
export class WeatherPreview {
  json = input.required<string>();

  parser = injectJsonParser(this.json, schema);
}
```

</hb-code-example>

`s.streaming.string()`, `s.streaming.array()`, and `s.streaming.object()` allow useful partial values while the JSON is incomplete.

---

## 3. Inspect Parser State

`parserState()` contains a normalized JSON AST. Every node has a `closed` flag, so your UI can distinguish complete values from values that are still open in the stream.

<hb-code-example header="parser-inspector.component.ts">

```ts
import { Component, computed, input } from '@angular/core';
import { injectJsonParser } from '@hashbrownai/angular';

@Component({
  selector: 'app-parser-inspector',
  template: ` <pre>{{ summary() | json }}</pre> `,
})
export class ParserInspector {
  json = input.required<string>();
  parser = injectJsonParser(this.json);

  summary = computed(() => {
    const state = this.parser.parserState();
    const root = state.rootId === null ? null : state.nodes[state.rootId];

    return {
      complete: state.isComplete,
      rootType: root?.type,
      rootClosed: root?.closed,
      nodeCount: Object.keys(state.nodes).length,
    };
  });
}
```

</hb-code-example>

Hashbrown preserves node and resolved value identity for unchanged branches. This lets Angular signals avoid unnecessary work when only one branch of a large JSON object continues streaming.

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

Use `injectImperativeJsonParser()` when chunks arrive as events and you do not want to concatenate the source string in a signal.

<hb-code-example header="stream-reader.component.ts">

```ts
import { Component } from '@angular/core';
import { injectImperativeJsonParser } from '@hashbrownai/angular';

@Component({
  selector: 'app-stream-reader',
  template: `<pre>{{ parser.value() | json }}</pre>`,
})
export class StreamReader {
  parser = injectImperativeJsonParser<{ answer?: string }>();

  async read(stream: ReadableStream<string>) {
    const reader = stream.getReader();

    try {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          return;
        }

        this.parser.parseChunk(result.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

</hb-code-example>

Prefer `injectJsonParser()` when your component already owns the full string. Prefer the imperative parser when the stream reader is the source of truth.
