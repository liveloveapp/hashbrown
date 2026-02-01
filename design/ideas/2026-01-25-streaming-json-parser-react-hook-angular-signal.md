# Idea

Provide a React hook and Angular signal for consuming the streaming JSON parser independently of Hashbrown’s UI/chat APIs. This would allow developers to feed chunks into the parser and subscribe to partial AST/resolved values in their own apps without adopting the full Hashbrown runtime.

# Research

The pure streaming JSON parser design targets a schema-agnostic, immutable AST with identity preservation and a `(state, chunk) -> state` interface. Exposing that via a React hook and Angular signal would align with the parser’s core goals and promote reuse outside Hashbrown UI rendering. See `design/core/json-parser.md`.

The integration plan positions the parser inside core reducers that consume raw completion chunks and emit resolved values while preserving identity. A standalone hook/signal could mirror that pattern in a framework-friendly way (e.g., keeping the parser state in React state or Angular signals and providing derived values). See `design/core/json-parser-integration.md`.

# Sketch

```text
React:
  const { state, value, error, complete, parseChunk } = useStreamingJsonParser();
  parseChunk(chunk);

Angular:
  const parser = createStreamingJsonParserSignal();
  parser.parseChunk(chunk);
  parser.value(); // signal
```
