import { computed, isSignal, linkedSignal, type Signal } from '@angular/core';
import {
  createMagicTextParserState,
  finalizeMagicText,
  type MagicTextAstNode,
  type MagicTextParserOptions,
  type MagicTextParserState,
  parseMagicTextChunk,
} from '@hashbrownai/core';

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

/**
 * A reference to a prop-driven streaming Magic Text parser backed by Angular signals.
 *
 * @public
 */
export interface MagicTextParserRef {
  /**
   * The current immutable parser state.
   */
  parserState: Signal<MagicTextParserState>;

  /**
   * Lookup map for AST nodes by id.
   */
  nodeById: Signal<Map<number, MagicTextAstNode>>;

  /**
   * Current root node, if available.
   */
  rootNode: Signal<MagicTextAstNode | null>;

  /**
   * Deepest currently open node, if any.
   */
  openNode: Signal<MagicTextAstNode | null>;
}

/**
 * Create a prop-driven Magic Text parser backed by Angular signals.
 *
 * @public
 * @param text - Signal containing the full markdown text that grows over time.
 * @param isComplete - Optional completion signal; when true, finalizes parser state.
 * @param options - Optional parser option overrides (value or signal).
 */
export function injectMagicTextParser(
  text: Signal<string>,
  isComplete?: Signal<boolean>,
  options?:
    | Partial<MagicTextParserOptions>
    | Signal<Partial<MagicTextParserOptions> | undefined>,
): MagicTextParserRef {
  const source = computed(() => {
    const optionsValue = normalizeOptions(readOptions(options));
    return {
      text: text() ?? '',
      isCompleteInput: isComplete?.() ?? false,
      options: optionsValue,
      optionsKey: getOptionsKey(optionsValue),
    };
  });

  const session = linkedSignal<
    {
      text: string;
      isCompleteInput: boolean;
      options: MagicTextParserOptions;
      optionsKey: string;
    },
    MagicTextParserSession
  >({
    source,
    computation: (currentSource, previous) => {
      const previousSession =
        previous?.value ??
        createSession(
          currentSource.text,
          currentSource.options,
          currentSource.optionsKey,
          currentSource.isCompleteInput,
        );

      return resolveNextSession(
        previousSession,
        currentSource.text,
        currentSource.options,
        currentSource.optionsKey,
        currentSource.isCompleteInput,
      );
    },
  });

  const parserState = computed(() => session().parserState);
  const nodeById = computed(() => {
    const map = new Map<number, MagicTextAstNode>();

    for (const node of parserState().nodes) {
      map.set(node.id, node);
    }

    return map;
  });

  const rootNode = computed(() => {
    const state = parserState();
    return state.rootId == null ? null : (nodeById().get(state.rootId) ?? null);
  });

  const openNode = computed(() => {
    const stack = parserState().stack;
    if (!stack.length) {
      return null;
    }

    const id = stack[stack.length - 1];
    return nodeById().get(id) ?? null;
  });

  return {
    parserState,
    nodeById,
    rootNode,
    openNode,
  };
}

function readOptions(
  options?:
    | Partial<MagicTextParserOptions>
    | Signal<Partial<MagicTextParserOptions> | undefined>,
): Partial<MagicTextParserOptions> | undefined {
  if (!options) {
    return undefined;
  }

  return isSignal(options) ? options() : options;
}

function normalizeOptions(
  options?: Partial<MagicTextParserOptions>,
): MagicTextParserOptions {
  return {
    segmenter: options?.segmenter ?? DEFAULT_OPTIONS.segmenter,
    enableTables: options?.enableTables ?? DEFAULT_OPTIONS.enableTables,
    enableAutolinks:
      options?.enableAutolinks ?? DEFAULT_OPTIONS.enableAutolinks,
  };
}

function getSegmenterKey(
  segmenter: MagicTextParserOptions['segmenter'],
): string {
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
  const parsedState =
    text.length > 0 ? parseMagicTextChunk(initialState, text) : initialState;

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
      : previous.parserState;

    return {
      ...previous,
      parserState,
      isCompleteInput,
    };
  }

  let nextParserState: MagicTextParserState;

  if (text.startsWith(previous.text) && !previous.parserState.isComplete) {
    const suffix = text.slice(previous.text.length);
    nextParserState =
      suffix.length > 0
        ? parseMagicTextChunk(previous.parserState, suffix)
        : previous.parserState;
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
