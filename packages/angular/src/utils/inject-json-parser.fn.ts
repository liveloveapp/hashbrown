import { signal, type Signal } from '@angular/core';
import {
  createParserState,
  parseChunk,
  type ParserError,
  type ParserState,
  s,
} from '@hashbrownai/core';

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

/**
 * A reference to a streaming JSON parser backed by Angular signals.
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
 * Create a streaming JSON parser backed by Angular signals.
 *
 * @public
 * @typeParam Schema - The Hashbrown schema used to resolve streaming values.
 * @param schema - Optional Skillet schema to resolve values from the parser state.
 */
export function injectJsonParser<Schema extends s.HashbrownType>(
  schema: Schema,
): JsonParserRef<s.Infer<Schema>>;

/**
 * Create a streaming JSON parser backed by Angular signals without schema-based value resolution.
 * When no schema is provided, `value` reflects the root parser state’s resolvedValue.
 *
 * @public
 * @param schema - Optional Skillet schema to resolve values from the parser state.
 */
export function injectJsonParser<Output = unknown>(
  schema?: s.HashbrownType<Output>,
): JsonParserRef<Output> {
  const parserState = signal(createParserState());
  const cache = signal<s.FromJsonAstCache | undefined>(undefined);
  const value = signal<Output | undefined>(undefined);
  const error = signal<ParserError | Error | undefined>(undefined);

  const parseChunkHandler = (chunk: string) => {
    const currentState = parserState();
    const nextParserState = parseChunk(currentState, chunk);
    if (nextParserState === currentState) {
      return;
    }

    parserState.set(nextParserState);

    if (!schema) {
      const nextError = nextParserState.error ?? undefined;
      const nextValue =
        nextParserState.error === null
          ? getParserResolvedValue<Output>(nextParserState)
          : undefined;
      value.set(nextValue);
      error.set(nextError);
      return;
    }

    const output = s.fromJsonAst(schema, nextParserState, cache());
    const result = output.result;
    const isMatch = result.state === 'match';
    const isInvalid = result.state === 'invalid';
    if (isMatch) {
      value.set(result.value as Output);
    }

    cache.set(output.cache);
    error.set(resolveSchemaError(nextParserState.error, isInvalid, error()));
  };

  const reset = () => {
    parserState.set(createParserState());
    cache.set(undefined);
    value.set(undefined);
    error.set(undefined);
  };

  return {
    parserState: parserState.asReadonly(),
    value: value.asReadonly(),
    error: error.asReadonly(),
    parseChunk: parseChunkHandler,
    reset,
  };
}
