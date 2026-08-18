import {
  createPartialMarkdownParser,
  type MarkdownDocumentNode,
  type PartialMarkdownParser,
  type PartialMarkdownParserOptions,
} from '@cacheplane/partial-markdown';
import {
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

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

interface MagicTextParserResult {
  rootNode: MarkdownDocumentNode | null;
  isComplete: boolean;
}

interface MagicTextParserStore {
  getSession(): MagicTextParserSession;
  getSnapshot(): number;
  subscribe(listener: () => void): () => void;
  update(
    text: string,
    options: NormalizedParserOptions,
    optionsKey: string,
    isCompleteInput: boolean,
  ): void;
}

function normalizeOptions(
  dollarMath: boolean,
  bracketMath: boolean,
): NormalizedParserOptions {
  return {
    math: {
      dollar: dollarMath,
      bracket: bracketMath,
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

function createParserStore(
  initialSession: MagicTextParserSession,
): MagicTextParserStore {
  let session = initialSession;
  let revision = 0;
  const listeners = new Set<() => void>();

  return {
    getSession: () => session,
    getSnapshot: () => revision,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: (text, options, optionsKey, isCompleteInput) => {
      const next = resolveNextSession(
        session,
        text,
        options,
        optionsKey,
        isCompleteInput,
      );
      if (next === session) {
        return;
      }

      session = next;
      revision += 1;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

/**
 * Internal prop-driven hook for Cacheplane's identity-preserving Markdown parser.
 *
 * @param text - Full Markdown text that typically grows over time.
 * @param options - Optional Cacheplane parser options.
 * @param isCompleteInput - When true, finalizes the parse state for the current text.
 * @returns The current live Cacheplane root and completion state.
 */
export function useMagicTextParser(
  text: string,
  options?: PartialMarkdownParserOptions,
  isCompleteInput = false,
): MagicTextParserResult {
  const dollarMath = options?.math?.dollar ?? true;
  const bracketMath = options?.math?.bracket ?? true;
  const normalizedOptions = useMemo(
    () => normalizeOptions(dollarMath, bracketMath),
    [dollarMath, bracketMath],
  );
  const optionsKey = getOptionsKey(normalizedOptions);
  const [store] = useState(() =>
    createParserStore(
      createSession(text, normalizedOptions, optionsKey, isCompleteInput),
    ),
  );
  useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  // Cacheplane mutates nodes to preserve identity, so advance it only after
  // React commits the corresponding props. The store update rerenders before paint.
  useLayoutEffect(() => {
    store.update(text, normalizedOptions, optionsKey, isCompleteInput);
  }, [store, text, normalizedOptions, optionsKey, isCompleteInput]);

  const session = store.getSession();

  return {
    rootNode: session.parser.root,
    isComplete: session.parserComplete,
  };
}
