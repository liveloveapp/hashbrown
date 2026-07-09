/**
 * Magic Text streaming parser API.
 * @public
 */
export {
  createMagicTextParserState,
  finalizeMagicText,
  parseMagicTextChunk,
} from './state';

/**
 * Magic Text parser and AST types.
 * @public
 */
export type {
  CitationDefinition,
  CitationState,
  MagicTextAstNode,
  MagicTextNodeType,
  MagicTextParserOptions,
  MagicTextParserState,
  MagicTextWarning,
  ParseMode,
  SegmenterOptions,
  TextSegment,
} from './types';
