import {
  create,
  push,
  resolve,
  type StreamError,
  type StreamState,
} from '@cacheplane/partial-json';
import { s } from '@hashbrownai/core';
import { useMemo, useRef } from 'react';

interface JsonParserSession<Output> {
  parserState: StreamState;
  cache: s.FromJsonAstCache | undefined;
  value: Output | undefined;
  error: StreamError | Error | undefined;
  json: string;
  schemaKey: string | null;
}

const createSession = <Output,>(): JsonParserSession<Output> => ({
  parserState: create(),
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

function getParserResolvedValue<Output>(state: StreamState) {
  return resolve(state) as Output | undefined;
}

function resolveSchemaError(
  parserError: StreamError | null,
  isInvalid: boolean,
  previousError: StreamError | Error | undefined,
) {
  if (parserError) {
    return parserError;
  }

  if (!isInvalid) {
    return undefined;
  }

  return previousError ?? new Error('Schema invalid');
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
        nextParserState = push(baseSession.parserState, chunk);
      }
    } else {
      const resetState = create();
      nextParserState = json.length > 0 ? push(resetState, json) : resetState;
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
 * The result object returned by the `useJsonParser` hook.
 *
 * @public
 * @typeParam Output - The type resolved by the schema.
 */
export interface UseJsonParserResult<Output> {
  /**
   * The current streaming JSON parser state.
   */
  parserState: StreamState;

  /**
   * The latest resolved value produced by the schema or parser state.
   */
  value: Output | undefined;

  /**
   * The current parser or schema error, if any.
   */
  error: StreamError | Error | undefined;
}

/**
 * Create a prop-driven streaming JSON parser that can optionally resolve values with a Skillet schema.
 *
 * @public
 * @typeParam Schema - The Hashbrown schema used to resolve streaming values.
 * @param json - The full JSON string that grows over time.
 * @param schema - Optional Skillet schema to resolve values from the parser state.
 */
export function useJsonParser<Schema extends s.HashbrownType>(
  json: string,
  schema: Schema,
): UseJsonParserResult<s.Infer<Schema>>;

/**
 * Create a prop-driven streaming JSON parser without schema-based value resolution.
 * When no schema is provided, `value` reflects the root parser state’s resolvedValue.
 *
 * @public
 * @param json - The full JSON string that grows over time.
 * @param schema - Optional Skillet schema to resolve values from the parser state.
 */
export function useJsonParser<Output = unknown>(
  json: string,
  schema?: s.HashbrownType<Output>,
): UseJsonParserResult<Output> {
  const sessionRef = useRef<JsonParserSession<Output> | null>(null);
  const schemaKey = getSchemaKey(schema);

  const session = useMemo(() => {
    const previous = sessionRef.current ?? resetSession<Output>(schemaKey);
    const next = resolveNextSession(previous, json, schema, schemaKey);
    sessionRef.current = next;
    return next;
  }, [json, schema, schemaKey]);

  return {
    parserState: session.parserState,
    value: session.value,
    error: session.error,
  };
}
