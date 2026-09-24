import type { ApiExcerptToken } from '../../lib/api-reference';

/** A span of excerpt code that names another symbol. */
export interface ExcerptRange {
  start: number;
  end: number;
  /** The symbol's canonical reference. */
  reference: string;
}

/** Code to highlight plus the spans that reference other symbols. */
export interface Excerpt {
  code: string;
  ranges: ExcerptRange[];
}

/** A highlighted run of text, optionally part of a reference. */
export interface HighlightedSegment {
  text: string;
  color?: string;
  fontStyle?: number;
  reference?: string;
}

/** Highlighted code: theme colors and one list of segments per line. */
export interface HighlightedCode {
  fg: string;
  bg: string;
  lines: HighlightedSegment[][];
}

/** The subset of a Shiki themed token that {@link segmentLines} reads. */
export interface ThemedTokenLike {
  content: string;
  offset: number;
  color?: string;
  fontStyle?: number;
}

/** Strip the declaration keywords the Angular excerpt dropped from each token. */
const stripExport = (text: string) =>
  text
    .replace('export declare ', '')
    .replace('export type', 'type')
    .replace('export interface', 'interface');

function build(
  tokens: ApiExcerptToken[],
  transform: (text: string) => string,
): Excerpt {
  return tokens.reduce<Excerpt>(
    (excerpt, token) => {
      const text = transform(token.text);
      const start = excerpt.code.length;
      const code = excerpt.code + text;
      if (token.kind !== 'Reference' || !token.canonicalReference) {
        return { code, ranges: excerpt.ranges };
      }
      const leading = text.length - text.trimStart().length;
      const trimmed = text.trim();
      return trimmed
        ? {
            code,
            ranges: [
              ...excerpt.ranges,
              {
                start: start + leading,
                end: start + leading + trimmed.length,
                reference: token.canonicalReference,
              },
            ],
          }
        : { code, ranges: excerpt.ranges };
    },
    { code: '', ranges: [] },
  );
}

/**
 * Join excerpt tokens into code the way the Angular `SymbolExcerpt` did
 * (dropping `export declare`, `export type`, `export interface`), recording
 * where each `Reference` token lands.
 *
 * @param tokens - Excerpt tokens, e.g. a slice for a parameter's type.
 */
export function excerptFromTokens(tokens: ApiExcerptToken[]): Excerpt {
  return build(tokens, stripExport);
}

/**
 * Use a member's prettier-formatted signature, with reference spans taken from
 * its overlay tokens (which spell the same text). Overlay tokens that don't
 * spell the formatted content are ignored rather than mislinking.
 *
 * @param formattedContent - The formatted signature.
 * @param overlayTokens - Tokens for the formatted signature, if any.
 */
export function excerptFromFormattedContent(
  formattedContent: string,
  overlayTokens: ApiExcerptToken[] | undefined,
): Excerpt {
  const overlay = build(overlayTokens ?? [], (text) => text);
  return overlay.code === formattedContent
    ? overlay
    : { code: formattedContent, ranges: [] };
}

/**
 * Split highlighted tokens where references start and end, tagging each piece
 * with its reference (if any), so a renderer can wrap references in links
 * without losing highlighting.
 *
 * @param lines - Shiki tokens per line; offsets are into the whole code.
 * @param ranges - Reference spans in the same code.
 */
export function segmentLines(
  lines: ThemedTokenLike[][],
  ranges: ExcerptRange[],
): HighlightedSegment[][] {
  return lines.map((line) =>
    line.flatMap((token) => {
      const end = token.offset + token.content.length;
      const cuts = [
        token.offset,
        ...ranges
          .flatMap((range) => [range.start, range.end])
          .filter((cut) => cut > token.offset && cut < end),
        end,
      ].sort((a, b) => a - b);
      return cuts.slice(0, -1).flatMap((from, index) => {
        const to = cuts[index + 1];
        if (to <= from) {
          return [];
        }
        return [
          {
            text: token.content.slice(from - token.offset, to - token.offset),
            color: token.color,
            fontStyle: token.fontStyle,
            reference: ranges.find((r) => r.start <= from && to <= r.end)
              ?.reference,
          },
        ];
      });
    }),
  );
}
