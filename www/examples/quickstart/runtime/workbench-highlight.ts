/** The token kinds the workbench colours; `plain` text is left unstyled. */
export type WorkbenchTokenKind =
  | 'plain'
  | 'key'
  | 'string'
  | 'number'
  | 'literal'
  | 'punct'
  | 'heading'
  | 'marker'
  | 'emphasis'
  | 'link'
  | 'code';

/** One highlighted run of source text. Concatenating every token's text yields the input. */
export interface WorkbenchToken {
  readonly kind: WorkbenchTokenKind;
  readonly text: string;
}

/** The languages a workbench code block can be highlighted as. */
export type WorkbenchCodeLanguage = 'json' | 'markdown' | 'text';

const jsonToken =
  /"(?:[^"\\]|\\.)*(?:"|$)|-?\d[\d.eE+-]*|[A-Za-z]+|[{}[\]:,]|\s+|[^\s"{}[\]:,A-Za-z\d-]+|-/y;

/**
 * Splits JSON source into highlight tokens. It never throws and never drops
 * text, so partial JSON from a stream (an unterminated string, a half-typed
 * `tru`) highlights as far as it goes. A string followed by `:` is a key.
 *
 * @param source - Complete or partial JSON text.
 * @returns Tokens whose texts concatenate to `source`.
 */
export function tokenizeJson(source: string): readonly WorkbenchToken[] {
  const tokens: WorkbenchToken[] = [];
  jsonToken.lastIndex = 0;
  while (jsonToken.lastIndex < source.length) {
    const start = jsonToken.lastIndex;
    const match = jsonToken.exec(source);
    const text = match?.[0] ?? source.slice(start, start + 1);
    if (!match) jsonToken.lastIndex = start + 1;
    tokens.push({ kind: jsonKind(text, source, start + text.length), text });
  }
  return tokens;
}

function jsonKind(
  text: string,
  source: string,
  end: number,
): WorkbenchTokenKind {
  const first = text[0];
  if (first === '"') return /^\s*:/.test(source.slice(end)) ? 'key' : 'string';
  if (/[\d-]/.test(first ?? '') && text !== '-') return 'number';
  if (/^[A-Za-z]+$/.test(text))
    return ['true', 'false', 'null'].some((word) => word.startsWith(text))
      ? 'literal'
      : 'plain';
  if (/^[{}[\]:,]$/.test(text)) return 'punct';
  return 'plain';
}

const markdownInline =
  /\[\^[^\]\n]+\]:?|\[[^\]\n]*\]\([^)\n]*\)|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|__[^_\n]+__|_[^_\n]+_/g;

/**
 * Splits Markdown source into highlight tokens: headings, list markers,
 * emphasis, inline code, links and footnote references. Like
 * {@link tokenizeJson}, it never drops text.
 *
 * @param source - Complete or partial Markdown text.
 * @returns Tokens whose texts concatenate to `source`.
 */
export function tokenizeMarkdown(source: string): readonly WorkbenchToken[] {
  const tokens: WorkbenchToken[] = [];
  const push = (kind: WorkbenchTokenKind, text: string) => {
    if (text) tokens.push({ kind, text });
  };
  for (const [index, line] of source.split('\n').entries()) {
    if (index > 0) push('plain', '\n');
    if (/^#{1,6}\s/.test(line)) {
      push('heading', line);
      continue;
    }
    const marker = /^(\s*)([-*+]|\d+\.)(\s)/.exec(line);
    let rest = line;
    if (marker) {
      push('plain', marker[1] ?? '');
      push('marker', marker[2] ?? '');
      rest = line.slice((marker[1] ?? '').length + (marker[2] ?? '').length);
    }
    let last = 0;
    for (const match of rest.matchAll(markdownInline)) {
      const start = match.index ?? 0;
      push('plain', rest.slice(last, start));
      const text = match[0];
      push(
        text.startsWith('[')
          ? 'link'
          : text.startsWith('`')
            ? 'code'
            : 'emphasis',
        text,
      );
      last = start + text.length;
    }
    push('plain', rest.slice(last));
  }
  return tokens;
}

/**
 * Picks how to highlight an inspector value: structured values and JSON-looking
 * text as JSON, the Markdown tab's text as Markdown, anything else as plain text.
 *
 * @param value - The value shown in the block.
 * @param tab - The inspector tab it is shown in.
 */
export function workbenchCodeLanguage(
  value: unknown,
  tab: string,
): WorkbenchCodeLanguage {
  if (typeof value !== 'string') return 'json';
  if (/^\s*[[{]/.test(value)) return 'json';
  return tab === 'Markdown' ? 'markdown' : 'text';
}

/**
 * Renders source as highlighted DOM: each styled token becomes a
 * `span.wb-tok-<kind>`, plain runs stay text nodes, so `textContent` is the
 * source unchanged.
 *
 * @param source - The text to render.
 * @param language - How to tokenize it; `text` renders one text node.
 */
export function renderWorkbenchCode(
  source: string,
  language: WorkbenchCodeLanguage,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const tokens =
    language === 'json'
      ? tokenizeJson(source)
      : language === 'markdown'
        ? tokenizeMarkdown(source)
        : [{ kind: 'plain' as const, text: source }];
  for (const token of tokens) {
    if (token.kind === 'plain') {
      const previous = fragment.lastChild;
      if (previous?.nodeType === Node.TEXT_NODE)
        (previous as Text).appendData(token.text);
      else fragment.append(token.text);
      continue;
    }
    const span = document.createElement('span');
    span.className = `wb-tok-${token.kind}`;
    span.textContent = token.text;
    fragment.append(span);
  }
  return fragment;
}
