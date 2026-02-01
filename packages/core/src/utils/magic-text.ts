const DEFAULT_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'] as const;
const INCOMPLETE_LINK_HREF = 'hashbrown:incomplete-link';

const enum Token {
  Backslash = '\\',
  LinkStart = '[',
  LinkEnd = ']',
  ParenOpen = '(',
  ParenClose = ')',
  AttrOpen = '{',
  AttrClose = '}',
  Caret = '^',
  QuoteSingle = "'",
  QuoteDouble = '"',
  Comma = ',',
  Backtick = '`',
}

const INLINE_WHITESPACE = /[\s\n\r\t]/;
const ATTR_NAME = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

type ParserOptions = {
  allowedProtocols: readonly string[];
  citationNumberingBase: number;
  emphasisIntraword: boolean;
};

type MagicParseResult = {
  fragments: Fragment[];
  warnings: ParseWarning[];
  meta: {
    citationOrder: string[];
    citationNumbers: Record<string, number | string>;
    stats: { chars: number; runs: number; fragments: number };
  };
};

type BaseFragment = {
  id: string;
  range: { start: number; end: number };
  state: 'final' | 'provisional';
  rev: number;
};

type LinkMark = {
  href: string;
  title?: string;
  ariaLabel?: string;
  target?: string;
  rel?: string;
  unknownAttrs?: Record<string, string>;
  policy: 'allowed';
};

type MarkSet = {
  strong?: true;
  em?: true;
  code?: true;
  link?: LinkMark;
};

type TextFragment = BaseFragment & {
  kind: 'text';
  text: string;
  marks: MarkSet;
};

type CitationFragment = BaseFragment & {
  kind: 'citation';
  text: string;
  marks: Record<string, never>;
  citation: {
    id: string;
    number: number | string;
  };
};

type Fragment = TextFragment | CitationFragment;

type ParseWarning =
  | { code: 'unknown_link_attr'; key: string; range: [number, number] }
  | { code: 'disallowed_protocol'; href: string; range: [number, number] }
  | { code: 'unmatched_closer'; token: string; range: [number, number] }
  | {
      code: 'unterminated_construct';
      kind: 'em' | 'strong' | 'link' | 'citation' | 'attrs' | 'title' | 'code';
      at: number;
    };

type NormalizedOptions = ParserOptions;

type InlineNode =
  | {
      type: 'text';
      text: string;
      sources: number[];
    }
  | {
      type: 'em' | 'strong';
      children: InlineNode[];
      start: number;
      end: number;
    }
  | {
      type: 'link';
      children: InlineNode[];
      mark: LinkMark;
      start: number;
      end: number;
    }
  | {
      type: 'code';
      text: string;
      sources: number[];
      start: number;
      end: number;
    }
  | {
      type: 'citation';
      start: number;
      end: number;
      text: string;
      data: CitationFragment['citation'];
    };

type ParserContext = {
  input: string;
  options: NormalizedOptions;
  warnings: ParseWarning[];
  provisional: number[];
  citationState: CitationState;
  literalGuards: Set<number>;
};

type CitationState = {
  order: string[];
  numbers: Map<string, number | string>;
  numberingBase: number;
};

type TextSpan = {
  text: string;
  marks: MarkSet;
  sources: number[];
  provisional: boolean;
  lockMerge?: boolean;
};

/**
 * Supported MagicText formatting tags.
 * @public
 */
export type MagicTextTag = 'strong' | 'em';

/**
 * Whitespace flags attached to fragments for rendering fidelity.
 * @public
 */
export type MagicTextHasWhitespace = {
  before: boolean;
  after: boolean;
};

/**
 * Renderable text fragment produced by MagicText parsing.
 * @public
 */
export type MagicTextFragmentText = TextFragment & {
  type: 'text';
  key: string;
  tags: MagicTextTag[];
  wrappers: MagicTextTag[];
  whitespace: FragmentWhitespace;
  renderWhitespace: MagicTextHasWhitespace;
  isCode: boolean;
  isStatic: boolean;
};

/**
 * Citation fragment produced by MagicText parsing.
 * @public
 */
export type MagicTextFragmentCitation = CitationFragment & {
  type: 'citation';
  key: string;
  wrappers?: undefined;
  whitespace: FragmentWhitespace;
  renderWhitespace: MagicTextHasWhitespace;
  isStatic: boolean;
};

/**
 * Union of all MagicText fragment variants.
 * @public
 */
export type MagicTextFragment =
  | MagicTextFragmentText
  | MagicTextFragmentCitation;

/**
 * Parsed MagicText result including fragments and warnings.
 * @public
 */
export type MagicTextResult = {
  fragments: MagicTextFragment[];
  warnings: ParseWarning[];
  meta: MagicParseResult['meta'];
};

type FragmentWhitespace = {
  before: boolean;
  after: boolean;
};

/**
 * Parses raw MagicText into renderable fragments with whitespace hints.
 * @public
 */
export function prepareMagicText(input: string): MagicTextResult {
  const parseResult = parseMagicText(input);
  const whitespaceHints = computeWhitespaceHints(parseResult.fragments);
  const renderWhitespaceHints = computeRenderWhitespaceHints(
    parseResult.fragments,
    whitespaceHints,
  );
  const fragments = parseResult.fragments.map((fragment, index) =>
    toRenderFragment(
      fragment,
      whitespaceHints[index],
      renderWhitespaceHints[index],
    ),
  );

  return {
    fragments,
    warnings: parseResult.warnings,
    meta: parseResult.meta,
  };
}

function parseMagicText(input: string): MagicParseResult {
  const normalized: NormalizedOptions = {
    allowedProtocols: DEFAULT_PROTOCOLS,
    citationNumberingBase: 1,
    emphasisIntraword: true,
  };

  const warnings: ParseWarning[] = [];
  const provisional: number[] = [];

  const ctx: ParserContext = {
    input,
    options: normalized,
    warnings,
    provisional,
    citationState: {
      order: [],
      numbers: new Map(),
      numberingBase: normalized.citationNumberingBase,
    },
    literalGuards: new Set(),
  };

  const nodes = parseInline(ctx, 0, input.length);
  const spans: TextSpan[] = [];

  collectTextSpans(nodes, spans, { marks: {}, provisional: false });
  markProvisionalSpans(spans, ctx.provisional);

  const textFragments = buildTextFragments(spans);
  const citationFragments = collectCitations(nodes, ctx);

  const fragments = [...textFragments, ...citationFragments].sort(
    (a, b) => a.range.start - b.range.start,
  );

  return {
    fragments,
    warnings,
    meta: {
      citationOrder: ctx.citationState.order,
      citationNumbers: Object.fromEntries(ctx.citationState.numbers.entries()),
      stats: {
        chars: input.length,
        runs: textFragments.length,
        fragments: fragments.length,
      },
    },
  };
}

function parseInline(
  ctx: ParserContext,
  start: number,
  end: number,
): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = start;
  let buffer = '';
  let sources: number[] = [];
  let lockNextText = false;

  const flush = () => {
    if (!buffer) {
      return null;
    }
    const node: InlineNode & { __lockMerge?: boolean } = {
      type: 'text',
      text: buffer,
      sources: sources.slice(),
    };
    if (lockNextText) {
      node.__lockMerge = true;
      lockNextText = false;
    }
    nodes.push(node);
    buffer = '';
    sources = [];
    return node;
  };

  while (i < end) {
    const ch = ctx.input[i];

    if (ch === Token.Backslash) {
      const next = readCodePoint(ctx.input, i + 1);
      if (next) {
        buffer += next.value;
        pushSources(sources, next.value.length, next.index);
        i = next.nextIndex;
        continue;
      }
    }

    if (ch === Token.LinkStart) {
      if (ctx.input[i + 1] === Token.Caret) {
        flush();
        const citation = tryParseCitation(ctx, i, end);
        if (citation) {
          nodes.push(citation.node);
          i = citation.nextIndex;
          continue;
        }
      } else {
        flush();
        const link = tryParseLink(ctx, i, end);
        if (link) {
          if (link.kind === 'link') {
            nodes.push(link.node);
          } else {
            nodes.push(...link.nodes);
          }
          i = link.nextIndex;
          continue;
        }
      }
    }

    if (ch === '*' || ch === '_') {
      flush();
      const emphasis = tryParseEmphasis(ctx, i, end);
      if (emphasis?.node) {
        nodes.push(emphasis.node);
        i = emphasis.nextIndex;
        continue;
      }
      if (ctx.literalGuards.delete(i)) {
        lockNextText = true;
      }
    }

    if (ch === Token.Backtick) {
      flush();
      const code = tryParseCode(ctx, i, end);
      if (code?.node) {
        nodes.push(code.node);
        i = code.nextIndex;
        continue;
      }
    }

    const cp = readCodePoint(ctx.input, i);
    if (!cp) {
      break;
    }
    buffer += cp.value;
    pushSources(sources, cp.value.length, cp.index);
    i = cp.nextIndex;
  }

  flush();
  return nodes;
}

function pushSources(target: number[], length: number, start: number) {
  for (let offset = 0; offset < length; offset += 1) {
    target.push(start + offset);
  }
}

type ParseResult<T> = { node: T; nextIndex: number } | null;
type LinkParseResult =
  | { kind: 'link'; node: InlineNode; nextIndex: number }
  | { kind: 'fallback'; nodes: InlineNode[]; nextIndex: number }
  | null;

function tryParseEmphasis(
  ctx: ParserContext,
  index: number,
  end: number,
): ParseResult<InlineNode> {
  const marker = ctx.input[index];
  if (marker !== '*' && marker !== '_') {
    return null;
  }

  let runLength = 1;
  while (
    runLength < 3 &&
    ctx.input[index + runLength] === marker &&
    index + runLength < end
  ) {
    runLength += 1;
  }
  if (
    !shouldTreatAsEmphasisMarker(
      ctx.input,
      index,
      runLength,
      marker,
      ctx.options.emphasisIntraword ?? true,
    )
  ) {
    return null;
  }

  const closing = findClosingMarker(
    ctx.input,
    marker,
    runLength,
    index + runLength,
    end,
  );
  if (closing == null) {
    return softCloseEmphasis(ctx, index, end, runLength, marker);
  }

  const contentStart = index + runLength;
  const contentEnd = closing;
  const children = parseInline(ctx, contentStart, contentEnd);
  const node = buildEmphasisNode(
    runLength,
    children,
    index,
    closing + runLength,
  );

  return {
    node,
    nextIndex: closing + runLength,
  };
}

function softCloseEmphasis(
  ctx: ParserContext,
  index: number,
  end: number,
  runLength: number,
  marker: string,
): ParseResult<InlineNode> | null {
  const contentStart = index + runLength;
  if (contentStart >= end) {
    return null;
  }
  const intraword = ctx.options.emphasisIntraword ?? true;
  if (
    hasFutureEmphasisOpener(ctx.input, marker, contentStart, end, intraword)
  ) {
    ctx.literalGuards.add(index);
    return null;
  }
  ctx.provisional.push(index);
  const children = parseInline(ctx, contentStart, end);
  const node = buildEmphasisNode(runLength, children, index, end);
  return {
    node,
    nextIndex: end,
  };
}

function buildEmphasisNode(
  runLength: number,
  children: InlineNode[],
  start: number,
  end: number,
): InlineNode {
  if (runLength >= 3) {
    const inner: InlineNode = {
      type: 'em',
      children,
      start: start + 2,
      end,
    };
    return {
      type: 'strong',
      children: [inner],
      start,
      end,
    };
  }
  if (runLength === 2) {
    return { type: 'strong', children, start, end };
  }
  return { type: 'em', children, start, end };
}

function hasFutureEmphasisOpener(
  input: string,
  marker: string,
  start: number,
  end: number,
  intraword: boolean,
): boolean {
  for (let i = start; i < end; i += 1) {
    if (input[i] !== marker || isEscaped(input, i)) {
      continue;
    }
    let runLength = 1;
    while (
      runLength < 3 &&
      i + runLength < end &&
      input[i + runLength] === marker
    ) {
      runLength += 1;
    }
    if (shouldTreatAsEmphasisMarker(input, i, runLength, marker, intraword)) {
      return true;
    }
  }
  return false;
}

function tryParseCode(
  ctx: ParserContext,
  index: number,
  end: number,
): ParseResult<InlineNode> {
  if (ctx.input[index] !== Token.Backtick) {
    return null;
  }

  const closing = findClosingBacktick(ctx.input, index + 1, end);
  const textStart = index + 1;
  if (closing == null) {
    if (textStart >= end) {
      return null;
    }
    ctx.provisional.push(index);
    return buildCodeNode(ctx, textStart, end, index, end);
  }

  return buildCodeNode(ctx, textStart, closing, index, closing + 1);
}

function buildCodeNode(
  ctx: ParserContext,
  textStart: number,
  textEnd: number,
  rangeStart: number,
  rangeEnd: number,
): ParseResult<InlineNode> {
  const text = ctx.input.slice(textStart, textEnd);
  const sources: number[] = [];
  let cursor = textStart;
  while (cursor < textEnd) {
    const cp = readCodePoint(ctx.input, cursor);
    if (!cp) {
      break;
    }
    pushSources(sources, cp.length, cp.index);
    cursor = cp.nextIndex;
  }
  return {
    node: {
      type: 'code',
      text,
      sources,
      start: rangeStart,
      end: rangeEnd,
    },
    nextIndex: rangeEnd,
  };
}

function shouldTreatAsEmphasisMarker(
  input: string,
  index: number,
  runLength: number,
  marker: string,
  intraword: boolean,
): boolean {
  const prev = input[index - 1];
  const next = input[index + runLength];
  if (!next || INLINE_WHITESPACE.test(next)) {
    return false;
  }
  if (!intraword) {
    return !(isWordChar(prev) && isWordChar(next));
  }
  if (marker === '_') {
    const prevIsWord = isWordChar(prev);
    const nextIsWord = isWordChar(next);
    if (prevIsWord && !nextIsWord) {
      return false;
    }
    return !(prevIsWord && nextIsWord);
  }
  return true;
}

function findClosingMarker(
  input: string,
  marker: string,
  runLength: number,
  start: number,
  end: number,
): number | null {
  for (let i = start; i < end; i += 1) {
    if (input[i] !== marker || isEscaped(input, i)) {
      continue;
    }
    let count = 0;
    while (i + count < end && input[i + count] === marker) {
      count += 1;
    }
    if (count === runLength && canCloseEmphasis(input, i)) {
      return i;
    }
    i += count - 1;
  }
  return null;
}

function canCloseEmphasis(input: string, index: number): boolean {
  const prev = input[index - 1];
  return !!prev && !INLINE_WHITESPACE.test(prev);
}

function findClosingBacktick(
  input: string,
  start: number,
  end: number,
): number | null {
  for (let i = start; i < end; i += 1) {
    if (input[i] === Token.Backtick && !isEscaped(input, i)) {
      return i;
    }
  }
  return null;
}

function isEscaped(input: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && input[i] === Token.Backslash; i -= 1) {
    slashCount += 1;
  }
  return Boolean(slashCount % 2);
}

function tryParseLink(
  ctx: ParserContext,
  index: number,
  end: number,
): LinkParseResult {
  const labelResult = readBracketed(ctx, index + 1, end, Token.LinkEnd);
  if (!labelResult) {
    return createIncompleteLinkLabel(ctx, index, end);
  }

  const afterLabel = skipWhitespace(ctx.input, labelResult.nextIndex + 1, end);
  if (ctx.input[afterLabel] !== Token.ParenOpen) {
    return null;
  }

  const destinationStart = afterLabel + 1;
  const dest = parseLinkDestination(ctx, destinationStart, end);
  if (!dest) {
    if (!hasVisibleContent(ctx.input, destinationStart, end)) {
      const literal = buildLiteralTextNode(
        ctx.input,
        index,
        Math.min(end, destinationStart),
        { lockMerge: true },
      );
      if (!literal) {
        return null;
      }
      return {
        kind: 'fallback',
        nodes: [literal],
        nextIndex: destinationStart,
      };
    }
    return createIncompleteLinkDestination(labelResult.nodes, index, end);
  }

  const afterDestination = dest.nextIndex;
  let attrsParsed: AttributeParseResult = {
    attrs: {},
    nextIndex: afterDestination,
  };
  let overallEnd = afterDestination;
  const attrStart = skipWhitespace(ctx.input, afterDestination, end);
  if (attrStart < end && ctx.input[attrStart] === Token.AttrOpen) {
    const parsed = parseAttributeList(ctx, attrStart + 1, end);
    if (!parsed) {
      ctx.provisional.push(attrStart);
      ctx.warnings.push({
        code: 'unterminated_construct',
        kind: 'attrs',
        at: attrStart,
      });
      return null;
    }
    attrsParsed = parsed;
    overallEnd = parsed.nextIndex;
  }
  const policy = applyLinkPolicy(ctx, dest.href.trim(), [index, overallEnd]);
  if (policy === 'drop') {
    return {
      kind: 'fallback',
      nodes: labelResult.nodes,
      nextIndex: overallEnd,
    };
  }

  const mark: LinkMark = {
    href: policy.href,
    title: dest.title,
    ariaLabel: attrsParsed.attrs.alt,
    target: policy.target ?? attrsParsed.attrs.target,
    rel: policy.rel ?? attrsParsed.attrs.rel,
    unknownAttrs: attrsParsed.unknownAttrs,
    policy: policy.policy,
  };

  return {
    kind: 'link',
    node: {
      type: 'link',
      children: labelResult.nodes,
      mark,
      start: index,
      end: overallEnd,
    },
    nextIndex: overallEnd,
  };
}

function createIncompleteLinkLabel(
  ctx: ParserContext,
  index: number,
  end: number,
): LinkParseResult {
  const labelStart = index + 1;
  if (labelStart >= end) {
    return null;
  }
  const literal = buildLiteralTextNode(ctx.input, labelStart, end);
  if (!literal) {
    return null;
  }
  const text = ctx.input.slice(labelStart, end);
  if (!/[*_`]/.test(text)) {
    ctx.provisional.push(index);
  }
  return buildSyntheticLink([literal], index, end);
}

function createIncompleteLinkDestination(
  nodes: InlineNode[],
  start: number,
  end: number,
): LinkParseResult {
  return buildSyntheticLink(nodes, start, end);
}

function buildSyntheticLink(
  nodes: InlineNode[],
  start: number,
  end: number,
): LinkParseResult {
  const mark: LinkMark = {
    href: INCOMPLETE_LINK_HREF,
    policy: 'allowed',
  };
  return {
    kind: 'link',
    node: {
      type: 'link',
      children: nodes,
      mark,
      start,
      end,
    },
    nextIndex: end,
  };
}

function buildLiteralTextNode(
  input: string,
  start: number,
  end: number,
  options?: { lockMerge?: boolean },
): InlineNode | null {
  if (start >= end) {
    return null;
  }
  const text = input.slice(start, end);
  const sources: number[] = [];
  let cursor = start;
  while (cursor < end) {
    const cp = readCodePoint(input, cursor);
    if (!cp) {
      break;
    }
    pushSources(sources, cp.length, cp.index);
    cursor = cp.nextIndex;
  }
  const node: InlineNode & { __lockMerge?: boolean } = {
    type: 'text',
    text,
    sources,
  };
  if (options?.lockMerge) {
    node.__lockMerge = true;
  }
  return node;
}

type ReadBracketResult = { nodes: InlineNode[]; nextIndex: number } | null;

function readBracketed(
  ctx: ParserContext,
  start: number,
  end: number,
  terminator: string,
): ReadBracketResult {
  let depth = 1;
  let i = start;
  while (i < end) {
    if (ctx.input[i] === Token.Backslash) {
      const escape = readCodePoint(ctx.input, i + 1);
      i = escape ? escape.nextIndex : i + 1;
      continue;
    }
    if (ctx.input[i] === Token.LinkStart) {
      depth += 1;
    } else if (ctx.input[i] === terminator) {
      depth -= 1;
      if (depth === 0) {
        return { nodes: parseInline(ctx, start, i), nextIndex: i };
      }
    }
    i += 1;
  }
  return null;
}

type LinkDestination = {
  href: string;
  title?: string;
  nextIndex: number;
} | null;

function parseLinkDestination(
  ctx: ParserContext,
  start: number,
  end: number,
): LinkDestination {
  let i = skipWhitespace(ctx.input, start, end);
  if (i >= end) {
    return null;
  }

  let href = '';
  if (ctx.input[i] === '<') {
    i += 1;
    const close = ctx.input.indexOf('>', i);
    if (close === -1 || close > end) {
      return null;
    }
    href = ctx.input.slice(i, close);
    i = close + 1;
  } else {
    while (i < end) {
      const ch = ctx.input[i];
      if (ch === Token.ParenClose || INLINE_WHITESPACE.test(ch)) {
        break;
      }
      if (ch === Token.Backslash && i + 1 < end) {
        const cp = readCodePoint(ctx.input, i + 1);
        if (cp) {
          href += cp.value;
          i = cp.nextIndex;
          continue;
        }
      }
      href += ch;
      i += 1;
    }
  }

  i = skipWhitespace(ctx.input, i, end);
  let title: string | undefined;
  if (
    ctx.input[i] === Token.QuoteSingle ||
    ctx.input[i] === Token.QuoteDouble
  ) {
    const quote = ctx.input[i];
    i += 1;
    const titleStart = i;
    while (i < end && ctx.input[i] !== quote) {
      if (ctx.input[i] === Token.Backslash && i + 1 < end) {
        i += 2;
        continue;
      }
      i += 1;
    }
    if (ctx.input[i] !== quote) {
      ctx.provisional.push(titleStart - 1);
      ctx.warnings.push({
        code: 'unterminated_construct',
        kind: 'title',
        at: titleStart - 1,
      });
      return null;
    }
    title = ctx.input.slice(titleStart, i);
    i += 1;
    i = skipWhitespace(ctx.input, i, end);
  }

  if (ctx.input[i] !== Token.ParenClose) {
    return null;
  }

  return { href, title, nextIndex: i + 1 };
}

type LinkAttributeBag = {
  alt?: string;
  target?: string;
  rel?: string;
};

type AttributeParseResult = {
  attrs: LinkAttributeBag;
  unknownAttrs?: Record<string, string>;
  nextIndex: number;
} | null;

function parseAttributeList(
  ctx: ParserContext,
  start: number,
  end: number,
): AttributeParseResult {
  const attrs: LinkAttributeBag = {};
  const unknownAttrs: Record<string, string> = {};
  let i = start;

  while (i < end) {
    i = skipWhitespace(ctx.input, i, end);
    if (ctx.input[i] === Token.AttrClose) {
      return {
        attrs,
        unknownAttrs: Object.keys(unknownAttrs).length
          ? unknownAttrs
          : undefined,
        nextIndex: i + 1,
      };
    }

    const nameStart = i;
    while (i < end && /[A-Za-z0-9_-]/.test(ctx.input[i])) {
      i += 1;
    }
    const name = ctx.input.slice(nameStart, i);
    if (!ATTR_NAME.test(name)) {
      return null;
    }

    i = skipWhitespace(ctx.input, i, end);
    if (ctx.input[i] !== '=') {
      return null;
    }
    i += 1;
    i = skipWhitespace(ctx.input, i, end);
    const quote = ctx.input[i];
    if (quote !== Token.QuoteSingle && quote !== Token.QuoteDouble) {
      return null;
    }
    i += 1;
    const valueStart = i;
    while (i < end && ctx.input[i] !== quote) {
      if (ctx.input[i] === Token.Backslash && i + 1 < end) {
        i += 2;
        continue;
      }
      i += 1;
    }
    if (ctx.input[i] !== quote) {
      return null;
    }
    const value = ctx.input.slice(valueStart, i);
    i += 1;
    i = skipWhitespace(ctx.input, i, end);
    if (ctx.input[i] === Token.Comma) {
      i += 1;
    }

    if (name === 'alt') {
      attrs.alt = value;
    } else if (name === 'target') {
      attrs.target = value;
    } else if (name === 'rel') {
      attrs.rel = value;
    } else {
      unknownAttrs[name] = value;
      ctx.warnings.push({
        code: 'unknown_link_attr',
        key: name,
        range: [Math.max(0, nameStart - 1), i],
      });
    }
  }

  return null;
}

function applyLinkPolicy(
  ctx: ParserContext,
  href: string,
  range: [number, number],
): LinkMark | 'drop' {
  const protocolMatch = href.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/);
  if (protocolMatch) {
    const protocol = protocolMatch[1].toLowerCase();
    if (!ctx.options.allowedProtocols.includes(protocol)) {
      ctx.warnings.push({ code: 'disallowed_protocol', href, range });
      return 'drop';
    }
  }

  return { href, policy: 'allowed' };
}

function tryParseCitation(
  ctx: ParserContext,
  index: number,
  end: number,
): ParseResult<InlineNode> {
  const close = ctx.input.indexOf(Token.LinkEnd, index + 2);
  if (close === -1 || close > end) {
    ctx.provisional.push(index);
    ctx.warnings.push({
      code: 'unterminated_construct',
      kind: 'citation',
      at: index,
    });
    return null;
  }
  const id = ctx.input.slice(index + 2, close).trim();
  const citation = resolveCitation(ctx, id);

  return {
    node: {
      type: 'citation',
      start: index,
      end: close + 1,
      text: `[${citation.number}]`,
      data: citation,
    },
    nextIndex: close + 1,
  };
}

function resolveCitation(ctx: ParserContext, id: string) {
  let citationNumber = ctx.citationState.numbers.get(id);
  if (citationNumber === undefined) {
    const ordinal =
      ctx.citationState.numberingBase + ctx.citationState.order.length;
    ctx.citationState.order.push(id);
    citationNumber = ordinal;
    ctx.citationState.numbers.set(id, citationNumber);
  }
  if (citationNumber === undefined) {
    throw new Error(`Unable to resolve citation number for "${id}"`);
  }
  return { id, number: citationNumber };
}

function collectTextSpans(
  nodes: InlineNode[],
  spans: TextSpan[],
  ctx: { marks: MarkSet; provisional: boolean },
) {
  for (const node of nodes) {
    if (node.type === 'text') {
      const lockMerge = Boolean(
        (node as { __lockMerge?: boolean })?.__lockMerge,
      );
      if (!node.text) {
        continue;
      }
      spans.push({
        text: node.text,
        marks: { ...ctx.marks },
        sources: node.sources,
        provisional: ctx.provisional,
        lockMerge,
      });
      continue;
    }
    if (node.type === 'code') {
      const lockMerge = Boolean(
        (node as { __lockMerge?: boolean })?.__lockMerge,
      );
      spans.push({
        text: node.text,
        marks: { ...ctx.marks, code: true },
        sources: [...node.sources],
        provisional: ctx.provisional,
        lockMerge,
      });
      continue;
    }
    if (node.type === 'em' || node.type === 'strong' || node.type === 'link') {
      const nextMarks: MarkSet = { ...ctx.marks };
      if (node.type === 'em') {
        nextMarks.em = true;
      } else if (node.type === 'strong') {
        nextMarks.strong = true;
      } else if (node.type === 'link') {
        nextMarks.link = node.mark;
      }
      collectTextSpans(node.children, spans, {
        marks: nextMarks,
        provisional: ctx.provisional,
      });
    }
  }
}

function markProvisionalSpans(spans: TextSpan[], starts: number[]) {
  if (!starts.length) {
    return;
  }
  const sorted = Array.from(new Set(starts)).sort((a, b) => a - b);
  for (const span of spans) {
    if (!span.sources.length) {
      continue;
    }
    const first = span.sources[0];
    if (sorted.some((start) => first >= start)) {
      span.provisional = true;
    }
  }
}

function collectCitations(
  nodes: InlineNode[],
  ctx: ParserContext,
): CitationFragment[] {
  const fragments: CitationFragment[] = [];
  for (const node of nodes) {
    if (node.type === 'citation') {
      fragments.push({
        kind: 'citation',
        text: node.text,
        marks: {},
        citation: node.data,
        range: { start: node.start, end: node.end },
        id: `c:${node.start}-${node.end}`,
        state: 'final',
        rev: 0,
      });
    }
    if (node.type === 'em' || node.type === 'strong' || node.type === 'link') {
      fragments.push(...collectCitations(node.children, ctx));
    }
  }
  return fragments;
}

function buildTextFragments(spans: TextSpan[]): TextFragment[] {
  const fragments: TextFragment[] = [];
  let current: TextSpan | null = null;
  for (const span of spans) {
    if (!span.text) {
      continue;
    }
    if (!current) {
      current = {
        text: span.text,
        marks: { ...span.marks },
        sources: [...span.sources],
        provisional: span.provisional,
        lockMerge: span.lockMerge,
      };
      continue;
    }
    if (
      span.provisional === current.provisional &&
      marksEqual(span.marks, current.marks) &&
      areSourcesAdjacent(current.sources, span.sources) &&
      !span.lockMerge &&
      !current.lockMerge
    ) {
      current.text += span.text;
      current.sources.push(...span.sources);
    } else {
      fragments.push(spanToFragment(current));
      current = {
        text: span.text,
        marks: { ...span.marks },
        sources: [...span.sources],
        provisional: span.provisional,
        lockMerge: span.lockMerge,
      };
    }
  }
  if (current) {
    fragments.push(spanToFragment(current));
  }
  return fragments;
}

function areSourcesAdjacent(a: number[], b: number[]): boolean {
  if (!a.length || !b.length) {
    return false;
  }
  return a[a.length - 1] + 1 === b[0];
}

function spanToFragment(span: TextSpan): TextFragment {
  const start = span.sources.length ? span.sources[0] : 0;
  const endSource = span.sources.length
    ? span.sources[span.sources.length - 1]
    : start + Math.max(0, span.text.length - 1);
  const fragment: TextFragment = {
    kind: 'text',
    text: span.text,
    marks: { ...span.marks },
    range: { start, end: endSource + 1 },
    state: span.provisional ? 'provisional' : 'final',
    rev: 0,
    id: buildFragmentId(start),
  };
  return fragment;
}

function buildFragmentId(start: number): string {
  return `r:${start}`;
}

function marksEqual(a: MarkSet, b: MarkSet): boolean {
  return (
    !!a.strong === !!b.strong &&
    !!a.em === !!b.em &&
    !!a.code === !!b.code &&
    linkEqual(a.link, b.link)
  );
}

function linkEqual(a?: LinkMark, b?: LinkMark): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.href === b.href &&
    a.title === b.title &&
    a.ariaLabel === b.ariaLabel &&
    a.target === b.target &&
    a.rel === b.rel &&
    a.policy === b.policy
  );
}

function skipWhitespace(input: string, start: number, end: number): number {
  let i = start;
  while (i < end && INLINE_WHITESPACE.test(input[i])) {
    i += 1;
  }
  return i;
}

function hasVisibleContent(input: string, start: number, end: number): boolean {
  for (let i = start; i < end; i += 1) {
    if (!INLINE_WHITESPACE.test(input[i] ?? '')) {
      return true;
    }
  }
  return false;
}

function isWordChar(ch?: string): boolean {
  return !!ch && /[\p{L}\p{N}_]/u.test(ch);
}

function readCodePoint(text: string, index: number) {
  if (index >= text.length) {
    return null;
  }
  const code = text.codePointAt(index);
  if (code == null) {
    return null;
  }
  const value = String.fromCodePoint(code);
  return {
    value,
    index,
    nextIndex: index + value.length,
    length: value.length,
  };
}

function toRenderFragment(
  fragment: Fragment,
  whitespace: FragmentWhitespace,
  renderWhitespace: MagicTextHasWhitespace,
): MagicTextFragment {
  if (fragment.kind === 'text') {
    const tags = buildTags(fragment.marks);
    return {
      ...fragment,
      type: 'text',
      key: fragment.id,
      tags,
      wrappers: tags,
      whitespace,
      renderWhitespace,
      isCode: Boolean(fragment.marks.code),
      isStatic: computeIsStatic(fragment),
    };
  }
  return {
    ...fragment,
    type: 'citation',
    key: fragment.id,
    whitespace,
    renderWhitespace,
    isStatic: computeIsStatic(fragment),
  };
}

function buildTags(marks: MarkSet): MagicTextTag[] {
  const tags: MagicTextTag[] = [];
  if (marks.strong) {
    tags.push('strong');
  }
  if (marks.em) {
    tags.push('em');
  }
  return tags;
}

function computeWhitespaceHints(fragments: Fragment[]): FragmentWhitespace[] {
  return fragments.map((fragment, index) => {
    const previous = fragments[index - 1];
    const next = fragments[index + 1];
    return {
      before: fragmentHasTrailingWhitespace(previous),
      after: fragmentHasLeadingWhitespace(next),
    };
  });
}

function computeRenderWhitespaceHints(
  fragments: Fragment[],
  whitespaceHints: FragmentWhitespace[],
): MagicTextHasWhitespace[] {
  return fragments.map((_, index) => {
    const hint = whitespaceHints[index];
    return {
      before: Boolean(hint?.before),
      after: Boolean(hint?.after),
    };
  });
}

function fragmentHasLeadingWhitespace(fragment?: Fragment): boolean {
  return (
    fragment?.kind === 'text' &&
    fragment.text.length > 0 &&
    /^\s/.test(fragment.text[0])
  );
}

function fragmentHasTrailingWhitespace(fragment?: Fragment): boolean {
  return (
    fragment?.kind === 'text' &&
    fragment.text.length > 0 &&
    /\s$/.test(fragment.text[fragment.text.length - 1])
  );
}

function computeIsStatic(fragment: Fragment): boolean {
  if (fragment.state === 'provisional') {
    return true;
  }
  if (fragment.kind === 'text') {
    return fragment.text.trim().length === 0;
  }
  return false;
}
