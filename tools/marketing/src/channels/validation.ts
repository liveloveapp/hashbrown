import type { Draft, SocialChannel } from './types.ts';

/** A draft broke a channel rule; `rule` names it and `field` the draft field. */
export class ValidationError extends Error {
  public readonly rule: string;
  public readonly field?: string;
  constructor(message: string, opts: { rule: string; field?: string }) {
    super(message);
    this.name = 'ValidationError';
    this.rule = opts.rule;
    this.field = opts.field;
  }
}

const MAX_X_CHARS = 280;

const MAX_LINKEDIN_CHARS = 3000;
const MAX_LINKEDIN_COMMENT_CHARS = 1250;

const MAX_DEVTO_TITLE = 128;
const MAX_DEVTO_TAGS = 4;
const MAX_DEVTO_TAG_LEN = 30;
const DEVTO_TAG_RE = /^[a-z0-9]+$/;

function codePointLength(s: string): number {
  return [...s].length;
}

function validateX(draft: Draft): void {
  const hasText = typeof draft.text === 'string';
  const hasThread = Array.isArray(draft.threadParts);

  if (hasText && hasThread) {
    throw new ValidationError('Draft cannot have both text and threadParts.', {
      rule: 'exclusive-text-thread',
    });
  }
  if (!hasText && !hasThread) {
    throw new ValidationError('Draft must have either text or threadParts.', {
      rule: 'missing-text-or-thread',
    });
  }

  if (
    typeof draft.text === 'string' &&
    codePointLength(draft.text) > MAX_X_CHARS
  ) {
    throw new ValidationError(
      `X text exceeds 280 characters (got ${codePointLength(draft.text)}).`,
      { rule: 'text-too-long', field: 'text' },
    );
  }

  if (draft.threadParts) {
    if (draft.threadParts.length < 2) {
      throw new ValidationError(
        'threadParts must contain at least 2 entries.',
        {
          rule: 'thread-too-short',
          field: 'threadParts',
        },
      );
    }
    for (let i = 0; i < draft.threadParts.length; i++) {
      const part = draft.threadParts[i];
      if (codePointLength(part) > MAX_X_CHARS) {
        throw new ValidationError(
          `threadParts[${i}] exceeds 280 characters (got ${codePointLength(part)}).`,
          { rule: 'thread-part-too-long', field: `threadParts[${i}]` },
        );
      }
    }
  }
}

function validateLinkedIn(draft: Draft): void {
  if (typeof draft.text !== 'string' || draft.text.trim().length === 0) {
    throw new ValidationError('LinkedIn draft.text is required.', {
      rule: 'linkedin-text-required',
      field: 'text',
    });
  }
  if (codePointLength(draft.text) > MAX_LINKEDIN_CHARS) {
    throw new ValidationError(
      `LinkedIn text exceeds 3000 characters (got ${codePointLength(draft.text)}).`,
      { rule: 'linkedin-text-too-long', field: 'text' },
    );
  }
  if (draft.threadParts) {
    throw new ValidationError(
      'LinkedIn does not support threads. Use text, plus firstComment for a follow-up.',
      { rule: 'linkedin-no-threads', field: 'threadParts' },
    );
  }
  if (draft.link) {
    throw new ValidationError(
      'LinkedIn adapter does not build link previews. Put the URL in firstComment or in the text.',
      { rule: 'linkedin-no-link-preview', field: 'link' },
    );
  }
  if (draft.firstComment !== undefined) {
    const len = codePointLength(draft.firstComment);
    if (len === 0 || len > MAX_LINKEDIN_COMMENT_CHARS) {
      throw new ValidationError(
        `LinkedIn firstComment must be 1-1250 characters (got ${len}).`,
        { rule: 'linkedin-comment-length', field: 'firstComment' },
      );
    }
  }
}

function validateDevTo(draft: Draft): void {
  if (typeof draft.text !== 'string' || draft.text.length === 0) {
    throw new ValidationError(
      'Dev.to draft.text (body markdown) is required.',
      {
        rule: 'devto-body-required',
        field: 'text',
      },
    );
  }
  if (!draft.article) {
    throw new ValidationError('Dev.to draft.article is required.', {
      rule: 'devto-article-required',
      field: 'article',
    });
  }
  const t = draft.article.title;
  if (typeof t !== 'string' || t.length === 0 || t.length > MAX_DEVTO_TITLE) {
    throw new ValidationError(
      `Dev.to article.title must be 1-128 characters (got ${t?.length ?? 0}).`,
      { rule: 'devto-title-length', field: 'article.title' },
    );
  }
  if (draft.article.tags) {
    if (draft.article.tags.length > MAX_DEVTO_TAGS) {
      throw new ValidationError(
        `Dev.to accepts at most 4 tags (got ${draft.article.tags.length}).`,
        { rule: 'devto-too-many-tags', field: 'article.tags' },
      );
    }
    for (let i = 0; i < draft.article.tags.length; i++) {
      const tag = draft.article.tags[i];
      if (!DEVTO_TAG_RE.test(tag) || tag.length > MAX_DEVTO_TAG_LEN) {
        throw new ValidationError(
          `Dev.to tag "${tag}" must match ^[a-z0-9]+$ and be ≤ 30 chars.`,
          { rule: 'devto-tag-format', field: `article.tags[${i}]` },
        );
      }
    }
  }
  if (draft.article.canonicalUrl !== undefined) {
    let parsed: URL;
    try {
      parsed = new URL(draft.article.canonicalUrl);
    } catch {
      throw new ValidationError(
        `Dev.to article.canonicalUrl is not a valid URL: ${draft.article.canonicalUrl}.`,
        { rule: 'devto-canonical-invalid', field: 'article.canonicalUrl' },
      );
    }
    if (parsed.protocol !== 'https:') {
      throw new ValidationError(
        `Dev.to article.canonicalUrl must use https: (got ${parsed.protocol}).`,
        { rule: 'devto-canonical-protocol', field: 'article.canonicalUrl' },
      );
    }
  }
  if (draft.threadParts) {
    throw new ValidationError(
      'Dev.to does not support threads. Use a single text body.',
      {
        rule: 'devto-no-threads',
        field: 'threadParts',
      },
    );
  }
}

/**
 * Checks a draft against its channel's rules; reports, never rewrites.
 *
 * @throws {ValidationError} On the first rule the draft breaks.
 */
export function validateDraft(
  draft: Draft,
  opts: { adapterId?: SocialChannel } = {},
): void {
  if (opts.adapterId && opts.adapterId !== draft.channel) {
    throw new ValidationError(
      `Channel mismatch: adapter is "${opts.adapterId}" but draft.channel is "${draft.channel}".`,
      { rule: 'channel-mismatch', field: 'channel' },
    );
  }
  switch (draft.channel) {
    case 'x':
      return validateX(draft);
    case 'devto':
      return validateDevTo(draft);
    case 'linkedin':
      return validateLinkedIn(draft);
    default: {
      const _exhaustive: never = draft.channel;
      throw new ValidationError(`Unknown channel: ${String(_exhaustive)}.`, {
        rule: 'unknown-channel',
        field: 'channel',
      });
    }
  }
}
