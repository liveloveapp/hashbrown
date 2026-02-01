import { computed, isSignal, linkedSignal, type Signal } from '@angular/core';
import {
  createParserState,
  parseChunk,
  type ParserError,
  type ParserState,
  s,
} from '@hashbrownai/core';

interface JsonParserSession<Output> {
  parserState: ParserState;
  cache: s.FromJsonAstCache | undefined;
  value: Output | undefined;
  error: ParserError | Error | undefined;
  json: string;
  schemaKey: string | null;
}

const createSession = <Output>(): JsonParserSession<Output> => ({
  parserState: createParserState(),
  cache: undefined,
  value: undefined,
  error: undefined,
  json: '',
  schemaKey: null,
});

function getSchemaKey(schema?: s.HashbrownType<unknown>) {
  if (!schema) {
    return null;
  }

  return JSON.stringify(s.toJsonSchema(schema));
}

function resolveSchemaError(
  parserError: ParserError | null,
  isInvalid: boolean,
  previousError: ParserError | Error | undefined,
) {
  if (parserError) {
    return parserError;
  }

  if (!isInvalid) {
    return undefined;
  }

  return previousError ?? new Error('Schema invalid');
}

function getParserResolvedValue<Output>(state: ParserState) {
  if (state.error || state.rootId === null) {
    return undefined;
  }

  return state.nodes[state.rootId]?.resolvedValue as Output | undefined;
}

function readSchema<Output>(
  schema?: s.HashbrownType<Output> | Signal<s.HashbrownType<Output>>,
): s.HashbrownType<Output> | undefined {
  if (!schema) {
    return undefined;
  }

  return isSignal(schema) ? schema() : schema;
}

function resetSession<Output>(
  schemaKey: string | null,
): JsonParserSession<Output> {
  return {
    ...createSession<Output>(),
    schemaKey,
  };
}

function resolveNextSession<Output>(
  previous: JsonParserSession<Output>,
  json: string,
  schema: s.HashbrownType<Output> | undefined,
  schemaKey: string | null,
): JsonParserSession<Output> {
  const schemaChanged = previous.schemaKey !== schemaKey;
  let baseSession = previous;

  if (schemaChanged) {
    baseSession = {
      ...previous,
      cache: undefined,
      value: undefined,
      error: undefined,
      schemaKey,
    };
  }

  let nextParserState = baseSession.parserState;
  let nextCache = baseSession.cache;
  let nextValue = baseSession.value;
  let nextError = baseSession.error;

  if (json !== baseSession.json) {
    if (json.startsWith(baseSession.json)) {
      const chunk = json.slice(baseSession.json.length);
      if (chunk.length > 0) {
        nextParserState = parseChunk(baseSession.parserState, chunk);
      }
    } else {
      const resetState = createParserState();
      nextParserState =
        json.length > 0 ? parseChunk(resetState, json) : resetState;
      nextCache = undefined;
      nextValue = undefined;
      nextError = undefined;
    }
  }

  if (!schema) {
    nextError = nextParserState.error ?? undefined;
    nextValue =
      nextParserState.error === null
        ? getParserResolvedValue<Output>(nextParserState)
        : undefined;
  } else {
    const output = s.fromJsonAst(schema, nextParserState, nextCache);
    const result = output.result;
    const isMatch = result.state === 'match';
    const isInvalid = result.state === 'invalid';
    if (isMatch) {
      nextValue = result.value as Output;
    }

    nextCache = output.cache;
    nextError = resolveSchemaError(nextParserState.error, isInvalid, nextError);
  }

  return {
    parserState: nextParserState,
    cache: nextCache,
    value: nextValue,
    error: nextError,
    json,
    schemaKey,
  };
}

/**
 * A reference to a prop-driven streaming JSON parser backed by Angular signals.
 *
 * @public
 * @typeParam Output - The type resolved by the schema.
 */
export interface JsonParserRef<Output> {
  /**
   * The current streaming JSON parser state.
   */
  parserState: Signal<ParserState>;

  /**
   * The latest resolved value produced by the schema or parser state.
   */
  value: Signal<Output | undefined>;

  /**
   * The current parser or schema error, if any.
   */
  error: Signal<ParserError | Error | undefined>;
}

/**
 * Create a prop-driven streaming JSON parser backed by Angular signals.
 *
 * @public
 * @typeParam Schema - The Hashbrown schema used to resolve streaming values.
 * @param json - Signal containing the full JSON string that grows over time.
 * @param schema - Optional Skillet schema to resolve values from the parser state.
 */
export function injectJsonParser<Schema extends s.HashbrownType>(
  json: Signal<string>,
  schema: Schema | Signal<Schema>,
): JsonParserRef<s.Infer<Schema>>;

/**
 * Create a prop-driven streaming JSON parser backed by Angular signals without schema-based value resolution.
 * When no schema is provided, `value` reflects the root parser state’s resolvedValue.
 *
 * @public
 * @param json - Signal containing the full JSON string that grows over time.
 * @param schema - Optional Skillet schema to resolve values from the parser state.
 */
export function injectJsonParser<Output = unknown>(
  json: Signal<string>,
  schema?: s.HashbrownType<Output> | Signal<s.HashbrownType<Output>>,
): JsonParserRef<Output> {
  const source = computed(() => {
    const schemaValue = readSchema(schema);
    return {
      json: json(),
      schema: schemaValue,
      schemaKey: getSchemaKey(schemaValue),
    };
  });

  const session = linkedSignal<
    {
      json: string;
      schema: s.HashbrownType<Output> | undefined;
      schemaKey: string | null;
    },
    JsonParserSession<Output>
  >({
    source,
    computation: (currentSource, previous) => {
      const previousSession =
        previous?.value ?? resetSession<Output>(currentSource.schemaKey);
      return resolveNextSession(
        previousSession,
        currentSource.json,
        currentSource.schema,
        currentSource.schemaKey,
      );
    },
  });

  return {
    parserState: computed(() => session().parserState),
    value: computed(() => session().value),
    error: computed(() => session().error),
  };
}
