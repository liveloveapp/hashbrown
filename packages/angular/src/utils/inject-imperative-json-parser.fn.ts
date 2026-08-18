import { signal, type Signal } from '@angular/core';
import {
  create,
  push,
  resolve,
  type StreamError,
  type StreamState,
} from '@cacheplane/partial-json';
import { s } from '@hashbrownai/core';

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

function getParserResolvedValue<Output>(state: StreamState) {
  return resolve(state) as Output | undefined;
}

/**
 * A reference to a streaming JSON parser backed by Angular signals.
 *
 * @public
 * @typeParam Output - The type resolved by the schema.
 */
export interface ImperativeJsonParserRef<Output> {
  /**
   * The current streaming JSON parser state.
   */
  parserState: Signal<StreamState>;

  /**
   * The latest resolved value produced by the schema or parser state.
   */
  value: Signal<Output | undefined>;

  /**
   * The current parser or schema error, if any.
   */
  error: Signal<StreamError | Error | undefined>;

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
export function injectImperativeJsonParser<Schema extends s.HashbrownType>(
  schema: Schema,
): ImperativeJsonParserRef<s.Infer<Schema>>;

/**
 * Create a streaming JSON parser backed by Angular signals without schema-based value resolution.
 * When no schema is provided, `value` reflects the root parser state’s resolvedValue.
 *
 * @public
 * @param schema - Optional Skillet schema to resolve values from the parser state.
 */
export function injectImperativeJsonParser<Output = unknown>(
  schema?: s.HashbrownType<Output>,
): ImperativeJsonParserRef<Output> {
  const parserState = signal(create());
  const cache = signal<s.FromJsonAstCache | undefined>(undefined);
  const value = signal<Output | undefined>(undefined);
  const error = signal<StreamError | Error | undefined>(undefined);

  const parseChunkHandler = (chunk: string) => {
    const currentState = parserState();
    const nextParserState = push(currentState, chunk);
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
    parserState.set(create());
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
