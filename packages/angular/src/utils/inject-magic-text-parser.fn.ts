import {
  createPartialMarkdownParser,
  type MarkdownDocumentNode,
  type MarkdownNode,
  type PartialMarkdownParser,
  type PartialMarkdownParserOptions,
} from '@cacheplane/partial-markdown';
import { computed, isSignal, linkedSignal, type Signal } from '@angular/core';

type NormalizedParserOptions = {
  math: {
    dollar: boolean;
    bracket: boolean;
  };
};

interface MagicTextParserSession {
  parser: PartialMarkdownParser;
  text: string;
  optionsKey: string;
  isCompleteInput: boolean;
  parserComplete: boolean;
}

/**
 * A reference to a prop-driven Cacheplane Markdown parser backed by Angular signals.
 *
 * @public
 */
export interface MagicTextParserRef {
  /** The current identity-preserving Cacheplane parser. */
  parser: Signal<PartialMarkdownParser>;

  /** Whether the current parser has been finalized. */
  isComplete: Signal<boolean>;

  /** Lookup map for Markdown nodes by id. */
  nodeById: Signal<Map<number, MarkdownNode>>;

  /** Current root node, if available. */
  rootNode: Signal<MarkdownDocumentNode | null>;

  /** Deepest currently streaming node, excluding the document root. */
  openNode: Signal<MarkdownNode | null>;
}

/**
 * Create a prop-driven Cacheplane Markdown parser backed by Angular signals.
 *
 * @public
 * @param text - Signal containing the full Markdown text that grows over time.
 * @param isComplete - Optional completion signal; when true, finalizes parser state.
 * @param options - Optional Cacheplane parser options (value or signal).
 */
export function injectMagicTextParser(
  text: Signal<string>,
  isComplete?: Signal<boolean>,
  options?:
    | PartialMarkdownParserOptions
    | Signal<PartialMarkdownParserOptions | undefined>,
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
      options: NormalizedParserOptions;
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

  const parser = computed(() => session().parser, { equal: () => false });
  const parserComplete = computed(() => session().parserComplete);
  const rootNode = computed(() => session().parser.root, { equal: () => false });
  const nodeById = computed(() => {
    const current = session();
    const map = new Map<number, MarkdownNode>();
    const visit = (node: MarkdownNode) => {
      map.set(node.id, node);
      if ('children' in node) {
        for (const child of node.children) {
          visit(child);
        }
      }
    };
    const root = current.parser.root;
    if (root) {
      visit(root);
    }

    return map;
  });
  const openNode = computed(
    () => findDeepestOpenNode(session().parser.root),
    { equal: () => false },
  );

  return {
    parser,
    isComplete: parserComplete,
    nodeById,
    rootNode,
    openNode,
  };
}

function findDeepestOpenNode(node: MarkdownNode | null): MarkdownNode | null {
  if (!node || node.status === 'complete') {
    return null;
  }

  if ('children' in node) {
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const openChild = findDeepestOpenNode(node.children[index] ?? null);
      if (openChild) {
        return openChild;
      }
    }
  }

  return node.type === 'document' ? null : node;
}

function readOptions(
  options?:
    | PartialMarkdownParserOptions
    | Signal<PartialMarkdownParserOptions | undefined>,
): PartialMarkdownParserOptions | undefined {
  if (!options) {
    return undefined;
  }

  return isSignal(options) ? options() : options;
}

function normalizeOptions(
  options?: PartialMarkdownParserOptions,
): NormalizedParserOptions {
  return {
    math: {
      dollar: options?.math?.dollar ?? true,
      bracket: options?.math?.bracket ?? true,
    },
  };
}

function getOptionsKey(options: NormalizedParserOptions): string {
  return `math:dollar:${String(options.math.dollar)}:bracket:${String(options.math.bracket)}`;
}

function createSession(
  text: string,
  options: NormalizedParserOptions,
  optionsKey: string,
  isCompleteInput: boolean,
): MagicTextParserSession {
  const parser = createPartialMarkdownParser(options);
  if (text.length > 0) {
    parser.push(text);
  }
  if (isCompleteInput) {
    parser.finish();
  }

  return {
    parser,
    text,
    optionsKey,
    isCompleteInput,
    parserComplete: isCompleteInput,
  };
}

function resolveNextSession(
  previous: MagicTextParserSession,
  text: string,
  options: NormalizedParserOptions,
  optionsKey: string,
  isCompleteInput: boolean,
): MagicTextParserSession {
  if (previous.optionsKey !== optionsKey) {
    return createSession(text, options, optionsKey, isCompleteInput);
  }

  const textChanged = text !== previous.text;
  const completionChanged = previous.isCompleteInput !== isCompleteInput;
  if (!textChanged && !completionChanged) {
    return previous;
  }

  if (!textChanged) {
    if (isCompleteInput && !previous.parserComplete) {
      previous.parser.finish();
    }

    return {
      ...previous,
      isCompleteInput,
      parserComplete: previous.parserComplete || isCompleteInput,
    };
  }

  const canAppend = !previous.parserComplete && text.startsWith(previous.text);
  const next = canAppend
    ? previous
    : createSession(text, options, optionsKey, false);
  if (canAppend) {
    next.parser.push(text.slice(previous.text.length));
  }
  if (isCompleteInput) {
    next.parser.finish();
  }

  return {
    ...next,
    text,
    optionsKey,
    isCompleteInput,
    parserComplete: isCompleteInput,
  };
}
