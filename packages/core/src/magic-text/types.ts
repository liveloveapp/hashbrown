type SegmentGranularity = 'grapheme' | 'word' | 'sentence';

/**
 * Segmenter configuration for parse-time text segmentation.
 * @public
 */
export type SegmenterOptions =
  | false
  | true
  | {
      locale?: string;
      granularity?: SegmentGranularity;
    };

/**
 * Options for the streaming Magic Text parser.
 * @public
 */
export type MagicTextParserOptions = {
  segmenter: SegmenterOptions;
  enableTables: boolean;
  enableAutolinks: boolean;
};

/**
 * Supported Magic Text AST node kinds.
 * @public
 */
export type MagicTextNodeType =
  | 'document'
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'list'
  | 'list-item'
  | 'code-block'
  | 'table'
  | 'table-row'
  | 'table-cell'
  | 'thematic-break'
  | 'text'
  | 'em'
  | 'strong'
  | 'strikethrough'
  | 'inline-code'
  | 'soft-break'
  | 'hard-break'
  | 'image'
  | 'link'
  | 'autolink'
  | 'citation';

/**
 * Parsing mode for block-level processing.
 * @public
 */
export type ParseMode =
  | 'block'
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'list-item'
  | 'code-fence'
  | 'table';

/**
 * Parser warning variants.
 * @public
 */
export type MagicTextWarning =
  | { code: 'unterminated_construct'; kind: string; at: number }
  | { code: 'invalid_citation_definition'; at: number }
  | { code: 'unmatched_closer'; token: string; at: number }
  | { code: 'segmenter_unavailable'; at: number }
  | { code: 'unknown_construct'; at: number };

/**
 * Parse-time text segment for animation-friendly rendering.
 * @public
 */
export type TextSegment = {
  text: string;
  start: number;
  end: number;
  kind: SegmentGranularity;
  isWhitespace: boolean;
  /**
   * Hint for renderers to avoid line-breaking before this segment.
   * @public
   */
  noBreakBefore?: boolean;
};

/**
 * Shared fields on all AST nodes.
 * @public
 */
export type MagicTextAstNodeBase = {
  id: number;
  type: MagicTextNodeType;
  parentId: number | null;
  closed: boolean;
  range: { start: number; end: number };
};

/**
 * AST node representing the document root.
 * @public
 */
export type MagicTextDocumentNode = MagicTextAstNodeBase & {
  type: 'document';
  children: number[];
};

/**
 * AST node representing a paragraph.
 * @public
 */
export type MagicTextParagraphNode = MagicTextAstNodeBase & {
  type: 'paragraph';
  children: number[];
};

/**
 * AST node representing a heading.
 * @public
 */
export type MagicTextHeadingNode = MagicTextAstNodeBase & {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: number[];
};

/**
 * AST node representing a blockquote.
 * @public
 */
export type MagicTextBlockquoteNode = MagicTextAstNodeBase & {
  type: 'blockquote';
  children: number[];
};

/**
 * AST node representing a list.
 * @public
 */
export type MagicTextListNode = MagicTextAstNodeBase & {
  type: 'list';
  ordered: boolean;
  start: number | null;
  tight: boolean;
  children: number[];
};

/**
 * AST node representing a list item.
 * @public
 */
export type MagicTextListItemNode = MagicTextAstNodeBase & {
  type: 'list-item';
  children: number[];
};

/**
 * AST node representing a fenced code block.
 * @public
 */
export type MagicTextCodeBlockNode = MagicTextAstNodeBase & {
  type: 'code-block';
  fence: '```' | '~~~';
  info?: string;
  meta?: string;
  text: string;
};

/**
 * AST node representing a table.
 * @public
 */
export type MagicTextTableNode = MagicTextAstNodeBase & {
  type: 'table';
  align: Array<'left' | 'right' | 'center' | 'none'>;
  children: number[];
};

/**
 * AST node representing a table row.
 * @public
 */
export type MagicTextTableRowNode = MagicTextAstNodeBase & {
  type: 'table-row';
  isHeader: boolean;
  children: number[];
};

/**
 * AST node representing a table cell.
 * @public
 */
export type MagicTextTableCellNode = MagicTextAstNodeBase & {
  type: 'table-cell';
  children: number[];
};

/**
 * AST node representing a thematic break.
 * @public
 */
export type MagicTextThematicBreakNode = MagicTextAstNodeBase & {
  type: 'thematic-break';
};

/**
 * AST node representing a text run.
 * @public
 */
export type MagicTextTextNode = MagicTextAstNodeBase & {
  type: 'text';
  text: string;
  segments: TextSegment[];
};

/**
 * AST node representing emphasis.
 * @public
 */
export type MagicTextEmphasisNode = MagicTextAstNodeBase & {
  type: 'em';
  children: number[];
};

/**
 * AST node representing strong emphasis.
 * @public
 */
export type MagicTextStrongNode = MagicTextAstNodeBase & {
  type: 'strong';
  children: number[];
};

/**
 * AST node representing strikethrough.
 * @public
 */
export type MagicTextStrikethroughNode = MagicTextAstNodeBase & {
  type: 'strikethrough';
  children: number[];
};

/**
 * AST node representing inline code.
 * @public
 */
export type MagicTextInlineCodeNode = MagicTextAstNodeBase & {
  type: 'inline-code';
  text: string;
};

/**
 * AST node representing a soft line break.
 * @public
 */
export type MagicTextSoftBreakNode = MagicTextAstNodeBase & {
  type: 'soft-break';
};

/**
 * AST node representing a hard line break.
 * @public
 */
export type MagicTextHardBreakNode = MagicTextAstNodeBase & {
  type: 'hard-break';
};

/**
 * AST node representing a link.
 * @public
 */
export type MagicTextLinkNode = MagicTextAstNodeBase & {
  type: 'link';
  url: string;
  title?: string;
  children: number[];
};

/**
 * AST node representing an image.
 * @public
 */
export type MagicTextImageNode = MagicTextAstNodeBase & {
  type: 'image';
  url: string;
  title?: string;
  alt: string;
};

/**
 * AST node representing an autolink.
 * @public
 */
export type MagicTextAutolinkNode = MagicTextAstNodeBase & {
  type: 'autolink';
  url: string;
  text: string;
};

/**
 * AST node representing a citation reference.
 * @public
 */
export type MagicTextCitationNode = MagicTextAstNodeBase & {
  type: 'citation';
  idRef: string;
  number?: number;
};

/**
 * Union of all AST node shapes.
 * @public
 */
export type MagicTextAstNode =
  | MagicTextDocumentNode
  | MagicTextParagraphNode
  | MagicTextHeadingNode
  | MagicTextBlockquoteNode
  | MagicTextListNode
  | MagicTextListItemNode
  | MagicTextCodeBlockNode
  | MagicTextTableNode
  | MagicTextTableRowNode
  | MagicTextTableCellNode
  | MagicTextThematicBreakNode
  | MagicTextTextNode
  | MagicTextEmphasisNode
  | MagicTextStrongNode
  | MagicTextStrikethroughNode
  | MagicTextInlineCodeNode
  | MagicTextSoftBreakNode
  | MagicTextHardBreakNode
  | MagicTextImageNode
  | MagicTextLinkNode
  | MagicTextAutolinkNode
  | MagicTextCitationNode;

/**
 * Citation definition captured during parsing.
 * @public
 */
export type CitationDefinition = {
  id: string;
  text: string;
  url?: string;
};

/**
 * Citation parser state.
 * @public
 */
export type CitationState = {
  order: string[];
  numbers: Record<string, number>;
  definitions: Record<string, CitationDefinition>;
};

/**
 * Immutable state for streaming Magic Text parsing.
 * @public
 */
export type MagicTextParserState = {
  nextId: number;
  nodes: MagicTextAstNode[];
  rootId: number | null;
  stack: number[];
  mode: ParseMode;
  warnings: MagicTextWarning[];
  citations: CitationState;
  lineBuffer: string;
  isComplete: boolean;
  index: number;
  line: number;
  column: number;
  options: MagicTextParserOptions;
  source: string;
  pathToId: Record<string, number>;
  pendingCarriageReturn: boolean;
  hasWarnedSegmenterUnavailable: boolean;
};
