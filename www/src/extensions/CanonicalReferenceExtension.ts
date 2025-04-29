import { RendererExtension, Token, TokenizerExtension } from 'marked';
import {
  CanonicalReference,
  ParsedCanonicalReference,
} from '../app/models/api-report.models';

const CANONICAL_REFERENCE = 'canonicalReference';
type CANONICAL_REFERENCE = typeof CANONICAL_REFERENCE;

type CanonicalReferenceToken = {
  type: CANONICAL_REFERENCE;
  raw: string;
  text: string;
  name: string;
  canonicalReference: string;
  before: string;
  after: string;
  beforeTokens: Token[];
  afterTokens: Token[];
};

function assertIsCanonicalReferenceToken(
  token: any,
): asserts token is CanonicalReferenceToken {
  if (token.type !== CANONICAL_REFERENCE) {
    throw new Error('Invalid token type');
  }
}

const CANONICAL_REFERENCE_REGEX = /@?[\w\/-]+![\w]+:[\w]+/;

export const CanonicalReferenceExtension: TokenizerExtension &
  RendererExtension = {
  name: CANONICAL_REFERENCE,
  level: 'inline',
  start(src: string) {
    const match = CANONICAL_REFERENCE_REGEX.exec(src);
    return match?.index;
  },
  tokenizer(src: string, tokens) {
    const match = CANONICAL_REFERENCE_REGEX.exec(src);

    if (match) {
      const parsed = new ParsedCanonicalReference(
        match[0] as CanonicalReference,
      );

      const index = src.indexOf(match[0]);
      const before = src.slice(0, index);
      const after = src.slice(index + match[0].length);

      const token: CanonicalReferenceToken = {
        type: CANONICAL_REFERENCE,
        raw: src,
        text: match[0],
        name: parsed.name,
        canonicalReference: parsed.referenceString,
        before,
        after,
        beforeTokens: [],
        afterTokens: [],
      };

      this.lexer.inline(token.before, token.beforeTokens);
      this.lexer.inline(token.after, token.afterTokens);

      return token;
    }

    return;
  },
  renderer(token) {
    assertIsCanonicalReferenceToken(token);
    return `${this.parser.parseInline(
      token.beforeTokens,
    )}<www-markdown-symbol-link reference="${
      token.canonicalReference
    }"></www-markdown-symbol-link>${this.parser.parseInline(token.afterTokens)}`;
  },
  childTokens: ['beforeTokens', 'afterTokens'],
};
