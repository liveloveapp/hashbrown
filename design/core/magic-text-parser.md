---
Created: 2026-02-01
Author: Mike Ryan
Affects: packages/core
---

# Streaming Magic Text Parser (Core)

## Objective

Create a new streaming Markdown parser for Magic Text in core, applying the JSON parser lessons (immutable AST, reducer-style parsing, open/closed nodes, stable identities). The parser must support full GitHub-flavored Markdown (GFM) block-level syntax, plus OpenAI-style citations and parse-time text segmentation via `Intl.Segmenter` to enable stable animation-friendly fragments.

## Background

We currently have a prototype inline-only Magic Text parser in `packages/core/src/utils/magic-text.ts` with a renderer in Angular. It is stateful and not designed for streaming or stable incremental updates. The JSON parser work in `design/core/json-parser.md`, `design/core/json-parser-integration.md`, and `design/core/json-ast-schema-integration.md` demonstrated a successful architecture: immutable state, AST nodes with open/closed status, reducer-style updates, and stable identity for unchanged subtrees. We should reuse that approach for a new Magic Text parser that can ingest streaming LLM output and emit a stable AST suitable for React/Angular adapters.

## Goals

- Functional API: `(state, chunk) -> state` with explicit `createState` and `finalize`.
- Immutable, POJO-only parser state and AST nodes; no classes.
- Full GFM block-level support (headings, lists, blockquotes, code fences, tables, etc.) and inline syntax (emphasis, links, code, autolinks, strikethrough, etc.).
- Open/closed nodes map to streaming “provisional” behavior.
- OpenAI-style citations:
  - Inline cite: `[^id]`
  - Definition: `[^id]: <text> <url?>`
  - First citation occurrence assigns the number.
- Parse-time segmentation via `Intl.Segmenter` with configurable granularity.
- Stable identity: unchanged nodes and segment arrays preserve object identity across chunks.
- Explicit whitespace fidelity rules so newline and hard-break semantics are preserved in the AST.
- Best-effort parsing with warnings instead of hard failure for malformed constructs.

## Non-Goals

- Render-specific outputs (React/Angular rendering surfaces).
- Security/sanitization of links or HTML (deferred to render-time).
- Task list item syntax (GFM add-on).
- Performance SLAs or telemetry in v1.
- Full HTML parsing (raw HTML is treated as text unless otherwise specified).

## UX / Workflows

- Callers maintain a parser state and feed chunks as they stream from an LLM.
- The AST can be read at any time for incremental rendering.
- Open nodes indicate provisional formatting; closed nodes indicate final formatting.
- Citations can be declared anywhere; the first definition is retained.

Example workflow:

- `state = createMagicTextParserState(options)`
- `state = parseMagicTextChunk(state, chunk)`
- `if (state.warnings.length) => surface warnings if desired`
- `if (state.isComplete) => use final AST`

## Data Model & API Changes

### Schema

Proposed state and AST shapes (draft):

````ts
type SegmentGranularity = 'grapheme' | 'word' | 'sentence';

type SegmenterOptions =
  | false
  | true
  | { locale?: string; granularity?: SegmentGranularity };

type MagicTextParserOptions = {
  segmenter: SegmenterOptions;
  enableTables: boolean;
  enableAutolinks: boolean;
};

type MagicTextParserState = {
  nextId: number;
  nodes: MagicTextAstNode[];
  rootId: number | null;
  stack: number[]; // open container ids
  mode: ParseMode;
  warnings: MagicTextWarning[];
  citations: CitationState;
  lineBuffer: string;
  isComplete: boolean;
  index: number;
  line: number;
  column: number;
};

type MagicTextAstNodeBase = {
  id: number;
  type: MagicTextNodeType;
  parentId: number | null;
  closed: boolean;
  range: { start: number; end: number };
};

type MagicTextAstNode =
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

// Text nodes store segment arrays computed at parse-time.
// Segments are stable by identity if the text content is unchanged.

type MagicTextTextNode = MagicTextAstNodeBase & {
  type: 'text';
  text: string;
  segments: TextSegment[];
};

type TextSegment = {
  text: string;
  start: number; // absolute index
  end: number; // absolute index (exclusive)
  kind: SegmentGranularity;
  isWhitespace: boolean;
};

type MagicTextDocumentNode = MagicTextAstNodeBase & {
  type: 'document';
  children: number[];
};

type MagicTextParagraphNode = MagicTextAstNodeBase & {
  type: 'paragraph';
  children: number[];
};

type MagicTextHeadingNode = MagicTextAstNodeBase & {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: number[];
};

type MagicTextBlockquoteNode = MagicTextAstNodeBase & {
  type: 'blockquote';
  children: number[];
};

type MagicTextListNode = MagicTextAstNodeBase & {
  type: 'list';
  ordered: boolean;
  start: number | null;
  tight: boolean;
  children: number[];
};

type MagicTextListItemNode = MagicTextAstNodeBase & {
  type: 'list-item';
  children: number[];
};

type MagicTextCodeBlockNode = MagicTextAstNodeBase & {
  type: 'code-block';
  fence: '```' | '~~~';
  info?: string;
  meta?: string;
  text: string;
};

type MagicTextTableNode = MagicTextAstNodeBase & {
  type: 'table';
  align: Array<'left' | 'right' | 'center' | 'none'>;
  children: number[]; // rows
};

type MagicTextTableRowNode = MagicTextAstNodeBase & {
  type: 'table-row';
  isHeader: boolean;
  children: number[]; // cells
};

type MagicTextTableCellNode = MagicTextAstNodeBase & {
  type: 'table-cell';
  children: number[];
};

type MagicTextThematicBreakNode = MagicTextAstNodeBase & {
  type: 'thematic-break';
};

type MagicTextEmphasisNode = MagicTextAstNodeBase & {
  type: 'em';
  children: number[];
};

type MagicTextStrongNode = MagicTextAstNodeBase & {
  type: 'strong';
  children: number[];
};

type MagicTextStrikethroughNode = MagicTextAstNodeBase & {
  type: 'strikethrough';
  children: number[];
};

type MagicTextInlineCodeNode = MagicTextAstNodeBase & {
  type: 'inline-code';
  text: string;
};

type MagicTextSoftBreakNode = MagicTextAstNodeBase & {
  type: 'soft-break';
};

type MagicTextHardBreakNode = MagicTextAstNodeBase & {
  type: 'hard-break';
};

type MagicTextLinkNode = MagicTextAstNodeBase & {
  type: 'link';
  url: string;
  title?: string;
  children: number[];
};

type MagicTextImageNode = MagicTextAstNodeBase & {
  type: 'image';
  url: string;
  title?: string;
  alt: string;
};

type MagicTextAutolinkNode = MagicTextAstNodeBase & {
  type: 'autolink';
  url: string;
  text: string;
};

type MagicTextCitationNode = MagicTextAstNodeBase & {
  type: 'citation';
  idRef: string;
  number?: number;
};

type CitationDefinition = {
  id: string;
  text: string; // full line minus URL
  url?: string;
};

type CitationState = {
  order: string[]; // ids in first-citation order
  numbers: Map<string, number>;
  definitions: Map<string, CitationDefinition>;
};

type MagicTextWarning =
  | { code: 'unterminated_construct'; kind: string; at: number }
  | { code: 'invalid_citation_definition'; at: number }
  | { code: 'unmatched_closer'; token: string; at: number }
  | { code: 'segmenter_unavailable'; at: number }
  | { code: 'unknown_construct'; at: number };

type ParseMode =
  | 'block'
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'list-item'
  | 'code-fence'
  | 'table';
````

### API

New core exports (proposal):

- `createMagicTextParserState(options?: Partial<MagicTextParserOptions>): MagicTextParserState`
- `parseMagicTextChunk(state: MagicTextParserState, chunk: string): MagicTextParserState`
- `finalizeMagicText(state: MagicTextParserState): MagicTextParserState`

### Validation

- No schema validation.
- Best-effort parsing; errors are warnings in state.
- Invalid or incomplete constructs remain as open nodes.
- Fatal errors are not expected in normal parsing; if we do add them later, they should be represented as warnings and the parser should remain usable.

### CRUD / Endpoints

- Not applicable.

## Core Logic / Algorithms

- Streaming parser with explicit mode stack for block and inline contexts.
- Immutable AST updates; only the modified path is recreated.
- Node identity is stable across chunks when untouched.
- Open/closed nodes track provisional vs final output.

### Tokenization + Reducer ops

Similar to the JSON parser design:

- A tokenizer emits a compact stream of `AstOp` instructions for the chunk.
- A reducer applies ops to produce the next AST state.

Example ops (draft):

```ts
type AstOp =
  | {
      kind: 'open-node';
      id: number;
      type: MagicTextNodeType;
      parentId: number | null;
    }
  | {
      kind: 'append-text';
      id: number;
      text: string;
      start: number;
      end: number;
    }
  | { kind: 'close-node'; id: number; end: number }
  | { kind: 'set-attr'; id: number; key: string; value: unknown }
  | { kind: 'warn'; warning: MagicTextWarning };
```

### Inline parsing

- Inline constructs are parsed within paragraph-like blocks:
  - emphasis/strong (`*`, `_`)
  - strikethrough (`~~`)
  - inline code (`` ` ``)
  - links (`[label](url)`)
  - images (`![alt](url)`)
  - autolinks (`<https://...>` and bare URLs/emails if enabled)
  - citations (`[^id]`)
- Unmatched openers create open nodes; the content is still emitted as text under a provisional parent.
- Paragraph-internal newlines are represented as explicit inline break nodes:
  - `soft-break` for a normal line ending inside a paragraph-like block.
  - `hard-break` for CommonMark hard breaks (two+ trailing spaces before newline or backslash newline).
- Text nodes keep literal text exactly as parsed for that token span (no trimming/collapsing), excluding syntax markers that are consumed to form non-text nodes.
- Backslash escaping follows CommonMark: a backslash escapes punctuation characters when used inline.
- Inline code spans use CommonMark-style backticks: any backtick run length can be used as a delimiter, and content may include shorter backtick runs without closing.
- Link destinations support optional titles in the CommonMark formats:
  - `[label](url "title")`
  - `[label](url 'title')`
  - `[label](url (title))`
- Link destinations may be enclosed in angle brackets inside the parentheses, per CommonMark.

### Block parsing

- Block-level nodes include headings, paragraphs, blockquotes, lists, code fences, tables, and thematic breaks.
- Lists support ordered and unordered forms; task list items are excluded in v1.
- Tables follow GFM pipe table rules and can be parsed after detecting a header separator row.
- Headings: ATX (`#`) and Setext (`=`/`-`) are supported.
- Code fences support backtick and tilde fences, optional info strings, and allow fence-open without fence-close to remain open/provisional.
- Blockquotes support lazy continuation.
- Lists support tight/loose determination based on blank lines between items.
- Block parsing precedence per line: code fences > blockquote marker > list marker > heading > thematic break > table header row > paragraph.
- List item indentation follows CommonMark rules (up to 3 leading spaces for markers; continuation lines must be indented to align content).
- Tables require a header separator row; alignment markers (`:---`, `---:`, `:---:`) populate `table.align`.

### Citations

- Inline `[^id]` creates a `citation` node.
- Definitions can appear anywhere: `[^id]: <text> <url?>`.
- The first definition for an id wins; later definitions are ignored with a warning.
- Citation numbering is assigned on first inline reference (first-seen order).
- Best-effort parsing extracts the URL if the definition line ends with a URL; the remaining text becomes `text`.
- URL extraction is conservative: if the final token in the line matches a URL pattern, it is treated as the URL; otherwise the entire line is `text`.
- Citation definitions use optimistic line-start handling while streaming:
  - If a new line begins with a definition prefix candidate (for example `[^id`, `[^id]`, or `[^id]:` with partial tail), treat the line as a provisional definition candidate and do not emit it as visible paragraph text yet.
  - When more input arrives, resolve the candidate deterministically:
    - If it becomes a valid definition line, keep definition semantics (non-rendered definition metadata).
    - If it becomes invalid as a definition, fall back to normal paragraph parsing and render text.
  - This optimistic behavior is only for definition lines at block start and must not change inline citation parsing semantics for `[^id]` inside paragraph text.

### Segmentation

- Text nodes are segmented during parsing using `Intl.Segmenter` when enabled.
- `segmenter: false` disables segmentation (empty `segments`).
- `segmenter: true` uses default locale + `word` granularity.
- Custom options allow `{ locale, granularity }`.
- Segments are stored on text nodes to avoid render-time computation.
- If `Intl.Segmenter` is unavailable in the runtime, segmentation is disabled and a single `segmenter_unavailable` warning is emitted.

### Streaming boundaries

- The parser maintains a `lineBuffer` to hold partial lines across chunks for block parsing.
- Block openers (e.g., fences, list markers, table headers) are detected only when their full line is present; otherwise they remain provisional until the line is complete.
- Inline parsing runs on paragraph-like buffers; open inline constructs remain open across chunk boundaries and are closed when the matching delimiter arrives.
- Newline bytes split across chunks are preserved by `lineBuffer` and emitted as the corresponding break node only after the full line ending is known.
- Definition-line citation prefixes are treated as provisional block candidates until enough characters are available to classify the line as a valid definition or plain text.

### Whitespace Contract

- The parser preserves source whitespace semantics in the AST; it does not normalize paragraph-internal line endings into spaces.
- Line endings are normalized to `\n` in parser text handling (`\r\n` and `\r` are treated as `\n`) while preserving structural meaning via `soft-break`/`hard-break` nodes.
- Leading and trailing spaces/tabs that belong to literal text are preserved in `text` node content.
- Whitespace used purely as Markdown syntax (e.g., spaces required after list markers, heading marker spacing, fence indentation) is not duplicated into text nodes unless it is part of the literal content.
- Final trailing newline at end of document is represented consistently with the same break-node rules used for paragraph-internal line endings.

### Autolinks

- Angle-bracket autolinks (`<https://example.com>`, `<user@example.com>`) are supported when `enableAutolinks` is true.
- Autolink literals are detected for `http://`, `https://`, and `www.` URLs, and for email-like `name@domain` tokens with a dot in the domain.
- Trailing punctuation (`.,;:!?`) is trimmed unless balanced by surrounding parentheses or brackets.
- Autolink literals must be bounded by whitespace or start/end of line; punctuation characters cannot start a literal.

### Ranges

- `range.start` is the absolute index of the first character of the construct, including its opening markers.
- `range.end` is exclusive and includes any closing markers when present.

### Inline nodes under blocks

- Paragraph-like blocks own inline children. Inline nodes are always stored as direct `children` of their closest paragraph/heading/list-item context, not as siblings of block nodes.
- Block node types are: `document`, `paragraph`, `heading`, `blockquote`, `list`, `list-item`, `code-block`, `table`, `table-row`, `table-cell`, `thematic-break`.
- Inline node types are: `text`, `em`, `strong`, `strikethrough`, `inline-code`, `link`, `image`, `autolink`, `citation`.
- Inline node types are: `text`, `em`, `strong`, `strikethrough`, `inline-code`, `soft-break`, `hard-break`, `link`, `image`, `autolink`, `citation`.
- Only block nodes may contain block children. Inline nodes may only contain inline children (where applicable), and inline nodes never appear as siblings of block nodes.

## Telemetry / Observability

None.

## Backward Compatibility

- This is a new parser; no compatibility guarantees with the current prototype output.
- Existing Magic Text utilities remain until React/Angular wrappers are designed and adopted.

## Permissions / Security

- No link sanitization or HTML filtering in core; defer to render-time.

## Rollout / Migration

1. Implement the new core parser in `packages/core` alongside the prototype.
2. Add exhaustive unit tests for streaming + GFM constructs.
3. Draft React and Angular design docs to wrap the core AST into renderable fragments.
4. Deprecate `packages/core/src/utils/magic-text.ts` and Angular prototype renderer once wrappers are ready and tests are green.
5. Remove deprecated Magic Text utilities from core and Angular in a follow-up release.

## Testing

- Streaming chunk boundaries across all block and inline constructs.
- Open/closed node behavior for provisional output.
- Identity preservation: unchanged nodes and segment arrays keep identity across chunks.
- Whitespace fidelity:
  - soft vs hard paragraph line breaks are emitted as `soft-break` and `hard-break` nodes.
  - leading/trailing spaces and tabs in literal text are preserved.
  - `\r\n`/`\r` normalization to `\n` does not change break-node semantics.
- Citations:
  - numbering by first inline reference
  - definitions before and after citations
  - optimistic definition-prefix handling at line start (`[^id`, `[^id]:...`) without premature text rendering
  - provisional definition candidates that later become invalid fall back to visible paragraph text
  - inline citation parsing behavior remains unchanged while adding optimistic definition handling
  - malformed definitions yield warnings
- Tables parsing (header separator and body rows).
- Autolink literals and angle-bracket autolinks.
- Ensure tests use top-level `test(...)` with arrange/act/assert formatting.

## Open Questions

- Should raw HTML blocks be parsed into dedicated nodes or left as text? -> left as text
- Do we need image syntax (`![]()`) in v1, or should it be treated as a specialized link node? -> specialized link node
- Do we want a debug AST visualizer similar to the JSON parser tooling? -> yes
- Should `finalizeMagicText` be required to mark completion, or inferred from parser mode? -> inferred
