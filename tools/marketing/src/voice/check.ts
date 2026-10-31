import type { Draft, DraftArticle } from '../channels/types.ts';
import { validateDraft, ValidationError } from '../channels/validation.ts';
import type {
  MarketingChannel,
  PostKind,
  QueueDraft,
  Source,
} from '../queue/types.ts';
import { BANNED_PATTERNS, BANNED_PHRASES } from './banned.ts';

/** One way a post breaks the voice guide. */
export interface VoiceIssue {
  rule:
    | 'em_dash'
    | 'hashtag'
    | 'emoji'
    | 'banned_phrase'
    | 'length'
    | 'link'
    | 'no_sources'
    | 'blog_schedule';
  message: string;
}

/** A post as the check sees it. `body` is the blog markdown. */
export interface VoiceCheckInput {
  channel: MarketingChannel;
  kind: PostKind;
  draft: QueueDraft;
  sources: Source[];
  body?: string;
}

interface Field {
  name: string;
  text: string;
  /** Long-form markdown: only dashes and banned phrases apply. */
  markdown?: boolean;
}

const URL_RE = /https?:\/\/[^\s)\]>]+/g;
// A hashtag starts with a letter, so "#1234" issue references pass.
const HASHTAG_RE = /(?:^|\s)#\p{L}[\p{L}\p{N}_]*/u;
// A joined sequence (family, skin tone, flag-style joins) is one emoji.
const EMOJI_RE =
  /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*/gu;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PHRASE_MATCHERS = BANNED_PHRASES.map((phrase) => ({
  phrase,
  re: new RegExp(
    `(?<![\\p{L}\\p{N}_])${phrase.split(/\s+/).map(escapeRegExp).join('\\s+')}(?![\\p{L}\\p{N}_])`,
    'iu',
  ),
}));

/** Curly apostrophes become straight ones so "here’s" matches "here's". */
function normalize(text: string): string {
  return text.replace(/[‘’]/g, "'");
}

function fieldsOf(post: VoiceCheckInput): Field[] {
  const fields: Field[] = [];
  const add = (name: string, text: string | undefined, markdown = false) => {
    if (typeof text === 'string' && text.length > 0) {
      fields.push({ name, text, markdown });
    }
  };
  const { draft } = post;
  switch (post.channel) {
    case 'x': {
      const d = draft as Draft;
      add('text', d.text);
      d.threadParts?.forEach((part, i) => add(`threadParts[${i}]`, part));
      break;
    }
    case 'linkedin': {
      const d = draft as Draft;
      add('text', d.text);
      add('firstComment', d.firstComment);
      break;
    }
    case 'devto': {
      const d = draft as { article?: { title?: string; description?: string } };
      add('article.title', d.article?.title);
      add('article.description', d.article?.description);
      break;
    }
    case 'blog': {
      add('title', (draft as { title?: string }).title);
      add('body', post.body, true);
      break;
    }
  }
  return fields;
}

function lengthIssue(post: VoiceCheckInput): VoiceIssue | undefined {
  const { draft } = post;
  let candidate: Draft | undefined;
  if (post.channel === 'x' || post.channel === 'linkedin') {
    candidate = draft as Draft;
  } else if (post.channel === 'devto') {
    // validateDraft wants the markdown body; a dev.to draft here holds none.
    const article = (draft as { article?: DraftArticle }).article;
    if (article) candidate = { channel: 'devto', text: 'body', article };
  }
  if (!candidate) return undefined;
  try {
    validateDraft(candidate);
  } catch (error) {
    if (error instanceof ValidationError) {
      return { rule: 'length', message: error.message };
    }
    throw error;
  }
  return undefined;
}

function urlsIn(post: VoiceCheckInput, fields: Field[]): string[] {
  const urls = fields.flatMap((f) => f.text.match(URL_RE) ?? []);
  const link = (post.draft as Draft).link;
  if (link?.url) urls.push(link.url);
  return urls;
}

/**
 * Checks a drafted post against the voice guide (`docs/marketing/voice.md`).
 * Reports problems; it never rewrites.
 */
export function checkVoice(post: VoiceCheckInput): VoiceIssue[] {
  const issues: VoiceIssue[] = [];
  const fields = fieldsOf(post);

  for (const field of fields) {
    if (field.text.includes('—') || /\s–\s/.test(field.text)) {
      issues.push({
        rule: 'em_dash',
        message: `${field.name} has an em dash; use a period or " - ".`,
      });
    }
    const text = normalize(field.text);
    for (const { phrase, re } of PHRASE_MATCHERS) {
      if (re.test(text)) {
        issues.push({
          rule: 'banned_phrase',
          message: `${field.name} uses "${phrase}", which Brian never writes.`,
        });
      }
    }
    for (const { name, pattern } of BANNED_PATTERNS) {
      if (pattern.test(text)) {
        issues.push({
          rule: 'banned_phrase',
          message: `${field.name} uses the "${name}" cadence, which Brian never writes.`,
        });
        break;
      }
    }
    if (!field.markdown && HASHTAG_RE.test(field.text)) {
      issues.push({
        rule: 'hashtag',
        message: `${field.name} has a hashtag.`,
      });
    }
  }

  const emoji = fields
    .filter((f) => !f.markdown)
    .reduce((n, f) => n + (f.text.match(EMOJI_RE)?.length ?? 0), 0);
  if (emoji > 1) {
    issues.push({
      rule: 'emoji',
      message: `Post has ${emoji} emoji; at most one.`,
    });
  }

  const length = lengthIssue(post);
  if (length) issues.push(length);

  if (post.channel === 'x') {
    const urls = urlsIn(post, fields);
    if (urls.length > 1) {
      issues.push({
        rule: 'link',
        message: `X post holds ${urls.length} URLs; at most one.`,
      });
    }
  }
  if (post.channel === 'linkedin') {
    const text = fields.find((f) => f.name === 'text')?.text ?? '';
    if (text.match(URL_RE) || (post.draft as Draft).link) {
      issues.push({
        rule: 'link',
        message: 'LinkedIn text holds a URL; put it in firstComment.',
      });
    }
  }

  if (post.sources.length === 0) {
    issues.push({
      rule: 'no_sources',
      message: 'Post has no sources; every claim needs one.',
    });
  }

  return issues;
}
