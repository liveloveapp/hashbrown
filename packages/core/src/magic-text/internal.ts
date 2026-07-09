import type {
  CitationState,
  MagicTextNodeType,
  MagicTextParserOptions,
  MagicTextWarning,
} from './types';

/**
 * Internal mutable draft representation used before AST materialization.
 * @internal
 */
export type DraftNode = {
  path: string;
  type: MagicTextNodeType;
  range: { start: number; end: number };
  closed: boolean;
  props: Record<string, unknown>;
  children: DraftNode[];
};

/**
 * Shared mutable parse context used by block and inline parsers.
 * @internal
 */
export type ParseContext = {
  options: MagicTextParserOptions;
  warnings: MagicTextWarning[];
  citations: CitationState;
  isComplete: boolean;
  hasWarnedSegmenterUnavailable: boolean;
};

/**
 * Result wrapper for parse helpers that propagate immutable parser context.
 * @internal
 */
export type ParseResult<T> = {
  value: T;
  warnings: MagicTextWarning[];
  citations: CitationState;
  hasWarnedSegmenterUnavailable: boolean;
};

/**
 * Source line plus absolute source offsets.
 * @internal
 */
export type SourceLine = {
  text: string;
  start: number;
  end: number;
  hasNewline: boolean;
};
