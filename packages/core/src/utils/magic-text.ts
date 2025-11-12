const DEFAULT_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'] as const;

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
}

const INLINE_WHITESPACE = /[\s\n\r\t]/;
const ATTR_NAME = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export type Segment = { segment: string; index: number; isWordLike?: boolean };

export type LinkPolicyFnResult =
  | 'allow'
  | 'drop'
  | { href: string; rel?: string; target?: string };

export type LinkPolicy =
  | 'sanitize'
  | 'passthrough'
  | ((href: string) => LinkPolicyFnResult);

export type ProvisionalPolicy = 'include' | 'whitespace-only' | 'drop';

export type ParseOptions = {
  allowedProtocols?: readonly string[];
  linkPolicy?: LinkPolicy;
  citations?: Record<string, CitationDef> | CitationDef[];
  citationNumberingBase?: number;
  unit?: 'run' | 'grapheme' | 'word';
  segmenter?:
    | Intl.Segmenter
    | ((text: string, unit: 'grapheme' | 'word') => Iterable<Segment>);
  emphasisIntraword?: boolean;
  schemaVersion?: 1;
  provisionalPolicy?: ProvisionalPolicy;
};

export type CitationDef = {
  id: string;
  label?: string | number;
  text?: string;
  href?: string;
  tooltip?: string;
};

export type MagicParseResult = {
  fragments: Fragment[];
  warnings: ParseWarning[];
  meta: {
    citationOrder: string[];
    citationNumbers: Record<string, number | string>;
    stats: { chars: number; runs: number; fragments: number };
  };
};

export type BaseFragment = {
  id: string;
  range: { start: number; end: number };
  state: 'final' | 'provisional';
  rev: number;
};

export type LinkMark = {
  href: string;
  title?: string;
  ariaLabel?: string;
  target?: string;
  rel?: string;
  unknownAttrs?: Record<string, string>;
  policy: 'allowed' | 'rewritten';
};

export type MarkSet = {
  strong?: true;
  em?: true;
  link?: LinkMark;
};

export type TextFragment = BaseFragment & {
  kind: 'text';
  text: string;
  marks: MarkSet;
};

export type CitationFragment = BaseFragment & {
  kind: 'citation';
  text: string;
  marks: {};
  citation: {
    id: string;
    number: number | string;
    missing?: boolean;
    href?: string;
    title?: string;
  };
};

export type Fragment = TextFragment | CitationFragment;

export type ParseWarning =
  | { code: 'unknown_link_attr'; key: string; range: [number, number] }
  | { code: 'disallowed_protocol'; href: string; range: [number, number] }
  | { code: 'missing_citation'; id: string; range: [number, number] }
  | { code: 'unmatched_closer'; token: string; range: [number, number] }
  | {
      code: 'unterminated_construct';
      kind: 'em' | 'strong' | 'link' | 'citation' | 'attrs' | 'title';
      at: number;
    };

type NormalizedOptions = Required<
  Pick<
    ParseOptions,
    'allowedProtocols' | 'linkPolicy' | 'citationNumberingBase' | 'unit' | 'emphasisIntraword'
  >
> & {
  segmenter?: ParseOptions['segmenter'];
  citations: Record<string, CitationDef>;
  provisionalPolicy: ProvisionalPolicy;
};

type InlineNode =
  | {
      type: 'text';
      text: string;
      sources: number[];
    }
  | { type: 'em' | 'strong'; children: InlineNode[]; start: number; end: number }
  | {
      type: 'link';
      children: InlineNode[];
      mark: LinkMark;
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
};

type CitationState = {
  defs: Record<string, CitationDef>;
  order: string[];
  numbers: Map<string, number | string>;
  numberingBase: number;
  warnings: ParseWarning[];
};

type TextSpan = {
  text: string;
  marks: MarkSet;
  sources: number[];
  provisional: boolean;
};

export type NormalizeFragmentsOptions = {
  provisionalPolicy?: ProvisionalPolicy;
  splitWhitespace?: boolean;
  insertBoundaryWhitespace?: boolean;
};

export type MagicTextRenderFragment =
  | (TextFragment & {
      type: 'text';
      key: string;
      wrappers: ('strong' | 'em')[];
      whitespace: FragmentWhitespace;
    })
  | (CitationFragment & {
      type: 'citation';
      key: string;
      wrappers?: undefined;
      whitespace: FragmentWhitespace;
    });

export type MagicTextRenderResult = {
  fragments: MagicTextRenderFragment[];
  warnings: ParseWarning[];
  meta: MagicParseResult['meta'];
};

export type MagicTextRenderOptions = ParseOptions & {
  normalize?: NormalizeFragmentsOptions;
};

type FragmentWhitespace = {
  before: boolean;
  after: boolean;
};

export function normalizeFragments(
  result: MagicParseResult,
  options: NormalizeFragmentsOptions = {},
): Fragment[] {
  const policy = options.provisionalPolicy ?? 'include';
  const splitWhitespace = options.splitWhitespace ?? false;
  const insertBoundaryWhitespace =
    options.insertBoundaryWhitespace ?? splitWhitespace;
  let fragments = applyProvisionalPolicy([...result.fragments], policy);
  if (splitWhitespace) {
    fragments = splitWhitespaceFragments(fragments);
  }
  if (insertBoundaryWhitespace) {
    fragments = insertBoundaryWhitespaceFragments(fragments);
  }
  return fragments;
}

export function renderMagicText(
  input: string,
  options: MagicTextRenderOptions = {},
): MagicTextRenderResult {
  const { normalize: normalizeOptions = {}, ...parseOptions } = options;
  const parseResult = parseMagicText(input, parseOptions);
  const normalized = normalizeFragments(parseResult, {
    provisionalPolicy: 'whitespace-only',
    ...normalizeOptions,
  });
  const whitespaceHints = computeWhitespaceHints(normalized);
  const fragments = normalized.map((fragment, index) =>
    toRenderFragment(fragment, whitespaceHints[index]),
  );

  return {
    fragments,
    warnings: parseResult.warnings,
    meta: parseResult.meta,
  };
}

export function parseMagicText(
  input: string,
  options: ParseOptions = {},
): MagicParseResult {
  if (options.schemaVersion && options.schemaVersion !== 1) {
    throw new Error(`Unsupported MAGIC_TEXT schema version: ${options.schemaVersion}`);
  }

  const normalized: NormalizedOptions = {
    allowedProtocols: options.allowedProtocols ?? DEFAULT_PROTOCOLS,
    linkPolicy: options.linkPolicy ?? 'sanitize',
    citations: normalizeCitationDefs(options.citations),
    citationNumberingBase: options.citationNumberingBase ?? 1,
    unit: options.unit ?? 'run',
    segmenter: options.segmenter,
    emphasisIntraword: options.emphasisIntraword ?? true,
    provisionalPolicy: options.provisionalPolicy ?? 'include',
  };

  const warnings: ParseWarning[] = [];
  const provisional: number[] = [];

  const ctx: ParserContext = {
    input,
    options: normalized,
    warnings,
    provisional,
    citationState: {
      defs: normalized.citations,
      order: [],
      numbers: new Map(),
      numberingBase: normalized.citationNumberingBase,
      warnings,
    },
  };

  const nodes = parseInline(ctx, 0, input.length);
  const spans: TextSpan[] = [];

  collectTextSpans(nodes, spans, { marks: {}, provisional: false });
  markProvisionalSpans(spans, ctx.provisional);

  const textFragments = buildTextFragments(spans, ctx, normalized.unit);
  const citationFragments = collectCitations(nodes, ctx, normalized.unit);

  let fragments: Fragment[] = [];
  fragments.push(...textFragments, ...citationFragments);
  fragments.sort((a, b) => a.range.start - b.range.start);
  fragments = applyProvisionalPolicy(
    fragments,
    normalized.provisionalPolicy,
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

function applyProvisionalPolicy<T extends Fragment>(
  fragments: T[],
  policy: ProvisionalPolicy,
): T[] {
  if (policy === 'include') {
    return fragments;
  }
  return fragments.filter((fragment) => {
    if (fragment.state === 'final') {
      return true;
    }
    if (policy === 'whitespace-only' && fragment.kind === 'text') {
      return fragment.text.trim().length === 0;
    }
    return false;
  });
}

function normalizeCitationDefs(
  defs: ParseOptions['citations'],
): Record<string, CitationDef> {
  if (!defs) {
    return {};
  }
  if (Array.isArray(defs)) {
    return defs.reduce<Record<string, CitationDef>>((acc, def) => {
      if (def && def.id) {
        acc[def.id] = def;
      }
      return acc;
    }, {});
  }
  return defs;
}

function parseInline(ctx: ParserContext, start: number, end: number): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = start;
  let buffer = '';
  let sources: number[] = [];

  const flush = () => {
    if (!buffer) {
      return;
    }
    nodes.push({ type: 'text', text: buffer, sources: sources.slice() });
    buffer = '';
    sources = [];
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

  const runLength = ctx.input[index + 1] === marker ? 2 : 1;
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

  const closing = findClosingMarker(ctx.input, marker, runLength, index + runLength, end);
  if (closing == null) {
    ctx.provisional.push(index);
    ctx.warnings.push({
      code: 'unterminated_construct',
      kind: runLength === 2 ? 'strong' : 'em',
      at: index,
    });
    return null;
  }

  const contentStart = index + runLength;
  const contentEnd = closing;
  const children = parseInline(ctx, contentStart, contentEnd);

  return {
    node: {
      type: runLength === 2 ? 'strong' : 'em',
      children,
      start: index,
      end: closing + runLength,
    },
    nextIndex: closing + runLength,
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
  if (!intraword) {
    return !(isWordChar(prev) && isWordChar(next));
  }
  if (marker === '_') {
    return !(isWordChar(prev) && isWordChar(next));
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
    if (count >= runLength) {
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
    ctx.provisional.push(index);
    ctx.warnings.push({ code: 'unterminated_construct', kind: 'link', at: index });
    return null;
  }

  const afterLabel = skipWhitespace(ctx.input, labelResult.nextIndex + 1, end);
  if (ctx.input[afterLabel] !== Token.ParenOpen) {
    return null;
  }

  const dest = parseLinkDestination(ctx, afterLabel + 1, end);
  if (!dest) {
    ctx.provisional.push(index);
    ctx.warnings.push({ code: 'unterminated_construct', kind: 'link', at: index });
    return null;
  }

  const attrStart = skipWhitespace(ctx.input, dest.nextIndex, end);
  let attrsParsed: AttributeParseResult = { attrs: {}, nextIndex: attrStart };
  if (ctx.input[attrStart] === Token.AttrOpen) {
    attrsParsed = parseAttributeList(ctx, attrStart + 1, end);
    if (!attrsParsed) {
      ctx.provisional.push(attrStart);
      ctx.warnings.push({ code: 'unterminated_construct', kind: 'attrs', at: attrStart });
      return null;
    }
  }

  const overallEnd = attrsParsed.nextIndex;
  const labelNodes = parseInline(ctx, index + 1, labelResult.nextIndex);
  const policy = applyLinkPolicy(ctx, dest.href.trim(), [index, overallEnd]);
  if (policy === 'drop') {
    return { kind: 'fallback', nodes: labelNodes, nextIndex: overallEnd };
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
      children: labelNodes,
      mark,
      start: index,
      end: overallEnd,
    },
    nextIndex: overallEnd,
  };
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

type LinkDestination = { href: string; title?: string; nextIndex: number } | null;

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
  if (ctx.input[i] === Token.QuoteSingle || ctx.input[i] === Token.QuoteDouble) {
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
      ctx.warnings.push({ code: 'unterminated_construct', kind: 'title', at: titleStart - 1 });
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
      return { attrs, unknownAttrs: Object.keys(unknownAttrs).length ? unknownAttrs : undefined, nextIndex: i + 1 };
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
): (LinkMark & { policy: 'allowed' | 'rewritten' }) | 'drop' {
  const policy = ctx.options.linkPolicy;
  if (typeof policy === 'function') {
    const decision = policy(href);
    if (decision === 'drop') {
      ctx.warnings.push({ code: 'disallowed_protocol', href, range });
      return 'drop';
    }
    if (decision === 'allow') {
      return { href, policy: 'allowed' };
    }
    return {
      href: decision.href,
      rel: decision.rel,
      target: decision.target,
      policy: 'rewritten',
    };
  }

  if (policy === 'passthrough') {
    return { href, policy: 'allowed' };
  }

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
    ctx.warnings.push({ code: 'unterminated_construct', kind: 'citation', at: index });
    return null;
  }
  const id = ctx.input.slice(index + 2, close).trim();
  const citation = resolveCitation(ctx, id, index, close + 1);

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

function resolveCitation(
  ctx: ParserContext,
  id: string,
  rangeStart: number,
  rangeEnd: number,
) {
  if (!ctx.citationState.numbers.has(id)) {
    const ordinal = ctx.citationState.numberingBase + ctx.citationState.order.length;
    ctx.citationState.order.push(id);
    const def = ctx.citationState.defs[id];
    const number = def?.label ?? ordinal;
    ctx.citationState.numbers.set(id, number);
    if (!def) {
      ctx.warnings.push({ code: 'missing_citation', id, range: [rangeStart, rangeEnd] });
    }
  }
  const def = ctx.citationState.defs[id];
  return {
    id,
    number: ctx.citationState.numbers.get(id)!,
    missing: !def ? true : undefined,
    href: def?.href ?? `#cite-${id}`,
    title: def?.tooltip ?? def?.text,
  };
}

function collectTextSpans(nodes: InlineNode[], spans: TextSpan[], ctx: { marks: MarkSet; provisional: boolean }) {
  for (const node of nodes) {
    if (node.type === 'text') {
      if (!node.text) {
        continue;
      }
      spans.push({
        text: node.text,
        marks: { ...ctx.marks },
        sources: node.sources,
        provisional: ctx.provisional,
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
      collectTextSpans(node.children, spans, { marks: nextMarks, provisional: ctx.provisional });
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

function collectCitations(nodes: InlineNode[], ctx: ParserContext, unit: 'run' | 'grapheme' | 'word'): CitationFragment[] {
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
      fragments.push(...collectCitations(node.children, ctx, unit));
    }
  }
  return fragments;
}

function buildTextFragments(
  spans: TextSpan[],
  ctx: ParserContext,
  unit: 'run' | 'grapheme' | 'word',
): TextFragment[] {
  const fragments: TextFragment[] = [];
  if (unit === 'run') {
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
        };
        continue;
      }
      if (
        span.provisional === current.provisional &&
        marksEqual(span.marks, current.marks) &&
        areSourcesAdjacent(current.sources, span.sources)
      ) {
        current.text += span.text;
        current.sources.push(...span.sources);
      } else {
        fragments.push(spanToFragment(current, unit));
        current = {
          text: span.text,
          marks: { ...span.marks },
          sources: [...span.sources],
          provisional: span.provisional,
        };
      }
    }
    if (current) {
      fragments.push(spanToFragment(current, unit));
    }
    return fragments;
  }

  const segmenter = createSegmentIterator(unit, ctx.options.segmenter);
  for (const span of spans) {
    const segments = segmenter(span.text);
    for (const seg of segments) {
      if (!seg.segment) {
        continue;
      }
      const startOffset = seg.index;
      const endOffset = seg.index + seg.segment.length;
      const sliced: TextSpan = {
        text: seg.segment,
        marks: { ...span.marks },
        sources: span.sources.slice(startOffset, endOffset),
        provisional: span.provisional,
      };
      fragments.push(spanToFragment(sliced, unit));
    }
  }
  return fragments;
}

function areSourcesAdjacent(a: number[], b: number[]): boolean {
  if (!a.length || !b.length) {
    return false;
  }
  return a[a.length - 1] + 1 === b[0];
}

function spanToFragment(span: TextSpan, unit: 'run' | 'grapheme' | 'word'): TextFragment {
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
    id: buildFragmentId(unit, start, endSource + 1),
  };
  return fragment;
}

function buildFragmentId(unit: 'run' | 'grapheme' | 'word', start: number, end: number): string {
  if (unit === 'run') {
    return `r:${start}-${end}`;
  }
  const prefix = unit === 'grapheme' ? 'g' : 'w';
  return `${prefix}:${start}`;
}

function marksEqual(a: MarkSet, b: MarkSet): boolean {
  return (
    !!a.strong === !!b.strong &&
    !!a.em === !!b.em &&
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

type SegmentIterator = (text: string) => Segment[];

function createSegmentIterator(
  unit: 'grapheme' | 'word',
  provided?: ParseOptions['segmenter'],
): SegmentIterator {
  if (provided instanceof Intl.Segmenter) {
    return (text) => Array.from(provided.segment(text));
  }
  if (typeof provided === 'function') {
    return (text) => Array.from(provided(text, unit));
  }
  try {
    const intl = new Intl.Segmenter(undefined, { granularity: unit });
    return (text) => Array.from(intl.segment(text));
  } catch {
    if (unit === 'grapheme') {
      return fallbackGraphemeSegments;
    }
    return fallbackWordSegments;
  }
}

function fallbackGraphemeSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let index = 0;
  for (const char of Array.from(text)) {
    segments.push({ segment: char, index });
    index += char.length;
  }
  return segments;
}

function fallbackWordSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let index = 0;
  while (index < text.length) {
    const cp = readCodePoint(text, index);
    if (!cp) {
      break;
    }
    if (isWordChar(cp.value)) {
      let word = cp.value;
      let nextIndex = cp.nextIndex;
      while (nextIndex < text.length) {
        const inner = readCodePoint(text, nextIndex);
        if (!inner || !isWordChar(inner.value)) {
          break;
        }
        word += inner.value;
        nextIndex = inner.nextIndex;
      }
      segments.push({ segment: word, index, isWordLike: true });
      index = nextIndex;
    } else {
      segments.push({ segment: cp.value, index });
      index = cp.nextIndex;
    }
  }
  return segments;
}

function skipWhitespace(input: string, start: number, end: number): number {
  let i = start;
  while (i < end && INLINE_WHITESPACE.test(input[i])) {
    i += 1;
  }
  return i;
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

function splitWhitespaceFragments(fragments: Fragment[]): Fragment[] {
  const result: Fragment[] = [];
  for (const fragment of fragments) {
    if (fragment.kind !== 'text' || !fragment.text) {
      result.push(fragment);
      continue;
    }
    const pieces = fragment.text.match(/\s+|\S+/g);
    if (!pieces || pieces.length === 1) {
      result.push(fragment);
      continue;
    }
    let offset = fragment.range.start;
    for (const piece of pieces) {
      const length = piece.length;
      result.push({
        ...fragment,
        id: `${fragment.id}:${offset}`,
        text: piece,
        range: { start: offset, end: offset + length },
      });
      offset += length;
    }
  }
  return result;
}

function insertBoundaryWhitespaceFragments(fragments: Fragment[]): Fragment[] {
  const result: Fragment[] = [];
  for (let i = 0; i < fragments.length; i += 1) {
    const current = fragments[i];
    result.push(current);
    const next = fragments[i + 1];
    if (needsBoundaryGap(current, next)) {
      result.push(createGapFragment(current as TextFragment));
    }
  }
  return result;
}

function needsBoundaryGap(a?: Fragment, b?: Fragment): boolean {
  return (
    isRenderableText(a) &&
    isRenderableText(b) &&
    !a.text.endsWith(' ') &&
    !b.text.startsWith(' ')
  );
}

function isRenderableText(fragment?: Fragment): fragment is TextFragment {
  return !!fragment && fragment.kind === 'text' && Boolean(fragment.text);
}

function createGapFragment(fragment: TextFragment): TextFragment {
  return {
    kind: 'text',
    text: ' ',
    marks: {},
    range: { start: fragment.range.end, end: fragment.range.end + 1 },
    state: 'final',
    rev: fragment.rev,
    id: `${fragment.id}/gap-${fragment.range.end}`,
  };
}

function toRenderFragment(
  fragment: Fragment,
  whitespace: FragmentWhitespace,
): MagicTextRenderFragment {
  if (fragment.kind === 'text') {
    return {
      ...fragment,
      type: 'text',
      key: fragment.id,
      wrappers: buildWrappers(fragment.marks),
      whitespace,
    };
  }
  return {
    ...fragment,
    type: 'citation',
    key: fragment.id,
    whitespace,
  };
}

function buildWrappers(marks: MarkSet): ('strong' | 'em')[] {
  const wrappers: ('strong' | 'em')[] = [];
  if (marks.strong) {
    wrappers.push('strong');
  }
  if (marks.em) {
    wrappers.push('em');
  }
  return wrappers;
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
