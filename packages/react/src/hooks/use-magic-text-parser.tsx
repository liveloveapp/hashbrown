import {
  createMagicTextParserState,
  finalizeMagicText,
  type MagicTextParserOptions,
  type MagicTextParserState,
  parseMagicTextChunk,
} from '@hashbrownai/core';
import { useMemo, useRef } from 'react';

interface MagicTextParserSession {
  parserState: MagicTextParserState;
  text: string;
  optionsKey: string;
  isCompleteInput: boolean;
}

const DEFAULT_OPTIONS: MagicTextParserOptions = {
  segmenter: true,
  enableTables: true,
  enableAutolinks: true,
};

function normalizeOptions(
  options?: Partial<MagicTextParserOptions>,
): MagicTextParserOptions {
  return {
    segmenter: options?.segmenter ?? DEFAULT_OPTIONS.segmenter,
    enableTables: options?.enableTables ?? DEFAULT_OPTIONS.enableTables,
    enableAutolinks: options?.enableAutolinks ?? DEFAULT_OPTIONS.enableAutolinks,
  };
}

function getSegmenterKey(segmenter: MagicTextParserOptions['segmenter']): string {
  if (segmenter === true || segmenter === false) {
    return String(segmenter);
  }

  const locale = segmenter.locale ?? '';
  const granularity = segmenter.granularity ?? 'word';
  return `object:${locale}:${granularity}`;
}

function getOptionsKey(options: MagicTextParserOptions): string {
  return `${getSegmenterKey(options.segmenter)}|tables:${String(options.enableTables)}|autolinks:${String(options.enableAutolinks)}`;
}

function parseFullText(
  text: string,
  options: MagicTextParserOptions,
  isCompleteInput: boolean,
): MagicTextParserState {
  const initialState = createMagicTextParserState(options);
  const parsedState = text.length > 0 ? parseMagicTextChunk(initialState, text) : initialState;

  return isCompleteInput ? finalizeMagicText(parsedState) : parsedState;
}

function createSession(
  text: string,
  options: MagicTextParserOptions,
  optionsKey: string,
  isCompleteInput: boolean,
): MagicTextParserSession {
  return {
    parserState: parseFullText(text, options, isCompleteInput),
    text,
    optionsKey,
    isCompleteInput,
  };
}

function resolveNextSession(
  previous: MagicTextParserSession,
  text: string,
  options: MagicTextParserOptions,
  optionsKey: string,
  isCompleteInput: boolean,
): MagicTextParserSession {
  const optionsChanged = previous.optionsKey !== optionsKey;
  const completionChanged = previous.isCompleteInput !== isCompleteInput;

  if (optionsChanged) {
    return createSession(text, options, optionsKey, isCompleteInput);
  }

  const textChanged = text !== previous.text;
  if (!textChanged && !completionChanged) {
    return previous;
  }

  if (!textChanged && completionChanged) {
    const parserState = isCompleteInput
      ? finalizeMagicText(previous.parserState)
      : parseMagicTextChunk(previous.parserState, '');

    return {
      ...previous,
      parserState,
      isCompleteInput,
    };
  }

  let nextParserState: MagicTextParserState;

  if (text.startsWith(previous.text)) {
    const suffix = text.slice(previous.text.length);
    nextParserState =
      suffix.length > 0 ? parseMagicTextChunk(previous.parserState, suffix) : previous.parserState;
  } else {
    nextParserState = parseFullText(text, options, false);
  }

  if (isCompleteInput) {
    nextParserState = finalizeMagicText(nextParserState);
  }

  return {
    parserState: nextParserState,
    text,
    optionsKey,
    isCompleteInput,
  };
}

/**
 * Internal prop-driven hook for streaming Magic Text parsing in React.
 *
 * @param text - Full markdown text that typically grows over time.
 * @param options - Optional parser option overrides.
 * @param isCompleteInput - When true, finalizes the parse state for the current text.
 * @returns The current immutable Magic Text parser state.
 */
export function useMagicTextParser(
  text: string,
  options?: Partial<MagicTextParserOptions>,
  isCompleteInput = false,
): MagicTextParserState {
  const sessionRef = useRef<MagicTextParserSession | null>(null);
  const segmenter = options?.segmenter;
  const segmenterKind =
    typeof segmenter === 'object' && segmenter !== null
      ? 'object'
      : String(segmenter ?? true);
  const segmenterLocale =
    typeof segmenter === 'object' && segmenter !== null
      ? (segmenter.locale ?? '')
      : '';
  const segmenterGranularity =
    typeof segmenter === 'object' && segmenter !== null
      ? (segmenter.granularity ?? 'word')
      : '';
  const normalizedOptions = useMemo(
    () => normalizeOptions(options),
    [
      options?.enableAutolinks,
      options?.enableTables,
      segmenterKind,
      segmenterLocale,
      segmenterGranularity,
    ],
  );
  const optionsKey = getOptionsKey(normalizedOptions);

  const session = useMemo(() => {
    const previous =
      sessionRef.current ??
      createSession(text, normalizedOptions, optionsKey, isCompleteInput);

    const next = resolveNextSession(
      previous,
      text,
      normalizedOptions,
      optionsKey,
      isCompleteInput,
    );

    sessionRef.current = next;
    return next;
  }, [text, normalizedOptions, optionsKey, isCompleteInput]);

  return session.parserState;
}
