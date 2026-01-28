import {
  createParserState,
  parseChunk,
  type ParserError,
  type ParserState,
  s,
} from '@hashbrownai/core';
import { useCallback, useRef, useState } from 'react';

interface JsonParserSession<Output> {
  parserState: ParserState;
  cache: s.FromJsonAstCache | undefined;
  value: Output | undefined;
  error: ParserError | Error | undefined;
}

const createSession = <Output,>(): JsonParserSession<Output> => ({
  parserState: createParserState(),
  cache: undefined,
  value: undefined,
  error: undefined,
});

function getSchemaKey(schema?: s.HashbrownType<unknown>) {
  if (!schema) {
    return null;
  }

  return JSON.stringify(s.toJsonSchema(schema));
}

function getParserResolvedValue<Output>(state: ParserState) {
  if (state.error || state.rootId === null) {
    return undefined;
  }

  return state.nodes[state.rootId]?.resolvedValue as Output | undefined;
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
  parserState: ParserState;

  /**
   * The latest resolved value produced by the schema or parser state.
   */
  value: Output | undefined;

  /**
   * The current parser or schema error, if any.
   */
  error: ParserError | Error | undefined;

  /**
   * Apply a JSON chunk to the parser.
   * @param chunk - The next JSON fragment.
   */
  parseChunk: (chunk: string) => void;

  /**
   * Reset the parser to its initial state.
   */
  reset: () => void;
}

/**
 * Create a streaming JSON parser that can optionally resolve values with a Skillet schema.
 *
 * @public
 * @typeParam Schema - The Hashbrown schema used to resolve streaming values.
 * @param schema - Optional Skillet schema to resolve values from the parser state.
 */
export function useJsonParser<Schema extends s.HashbrownType>(
  schema: Schema,
): UseJsonParserResult<s.Infer<Schema>>;

/**
 * Create a streaming JSON parser without schema-based value resolution.
 * When no schema is provided, `value` reflects the root parser state’s resolvedValue.
 *
 * @public
 * @param schema - Optional Skillet schema to resolve values from the parser state.
 */
export function useJsonParser<Output = unknown>(
  schema?: s.HashbrownType<Output>,
): UseJsonParserResult<Output> {
  const [session, setSession] = useState<JsonParserSession<Output>>(() =>
    createSession<Output>(),
  );
  const schemaKey = getSchemaKey(schema);
  const schemaKeyRef = useRef(schemaKey);

  const parseChunkHandler = useCallback(
    (chunk: string) => {
      setSession((previous) => {
        const shouldReset = schemaKeyRef.current !== schemaKey;
        if (shouldReset) {
          schemaKeyRef.current = schemaKey;
        }

        const baseSession = shouldReset ? createSession<Output>() : previous;
        const nextParserState = parseChunk(baseSession.parserState, chunk);
        if (nextParserState === baseSession.parserState) {
          return shouldReset ? baseSession : previous;
        }

        if (!schema) {
          const nextError = nextParserState.error ?? undefined;
          const nextValue =
            nextParserState.error === null
              ? getParserResolvedValue<Output>(nextParserState)
              : undefined;
          if (
            nextError === baseSession.error &&
            nextValue === baseSession.value
          ) {
            return {
              ...baseSession,
              parserState: nextParserState,
            };
          }

          return {
            ...baseSession,
            parserState: nextParserState,
            value: nextValue,
            error: nextError,
          };
        }

        const output = s.fromJsonAst(schema, nextParserState, baseSession.cache);
        const result = output.result;
        const isMatch = result.state === 'match';
        const isInvalid = result.state === 'invalid';
        const nextValue = isMatch ? (result.value as Output) : baseSession.value;
        const nextError = resolveSchemaError(
          nextParserState.error,
          isInvalid,
          baseSession.error,
        );
        const nextSession = {
          parserState: nextParserState,
          cache: output.cache,
          value: nextValue,
          error: nextError,
        } satisfies JsonParserSession<Output>;

        if (
          nextSession.cache === baseSession.cache &&
          nextSession.value === baseSession.value &&
          nextSession.error === baseSession.error
        ) {
          return {
            ...baseSession,
            parserState: nextParserState,
          };
        }

        return nextSession;
      });
    },
    [schema],
  );

  const reset = useCallback(() => {
    setSession(createSession());
  }, []);

  return {
    parserState: session.parserState,
    value: session.value,
    error: session.error,
    parseChunk: parseChunkHandler,
    reset,
  };
}
