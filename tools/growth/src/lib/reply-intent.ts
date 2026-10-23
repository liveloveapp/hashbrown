/** The reply content {@link isStopRequest} reads; nothing here is stored. */
export interface ReplyContent {
  text?: string | null;
  html?: string | null;
}

const STOP_PHRASES = [
  /\bunsubscribe\b/u,
  /\bstop\b/u,
  /\bopt[\s-]?out\b/u,
  /\bremove me\b/u,
  /\btake me off\b/u,
  /\bno more emails?\b/u,
  /\b(?:don'?t|do not) (?:e-?mail|contact|message|write to) me\b/u,
  /\bnot interested\b/u,
];

/** Lines that quote the original: dropped wherever they appear. */
const QUOTED_LINE = [/^\s*>/u, /^\s*On .+wrote:\s*$/u];

/** Separators above an unprefixed original: everything after them is cut. */
const ORIGINAL_START = [
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/iu,
  /^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/iu,
];

/** Visible text of an html body, without the quoted original. */
function htmlText(html: string): string {
  return html
    .replace(/<blockquote[\s\S]*?<\/blockquote>/giu, ' ')
    .replace(/<(?:style|script)[\s\S]*?<\/(?:style|script)>/giu, ' ')
    .replace(/<br\s*\/?>|<\/(?:p|div|li)>/giu, '\n')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&#39;|&apos;|&rsquo;/gu, "'")
    .replace(/&amp;/gu, '&');
}

/** The reply's own words: no quoted lines, nothing below an original. */
function ownText(content: ReplyContent): string {
  const source = content.text?.trim()
    ? content.text
    : content.html
      ? htmlText(content.html)
      : '';
  const lines = source.replace(/\r\n?/gu, '\n').split('\n');
  const end = lines.findIndex((line) =>
    ORIGINAL_START.some((re) => re.test(line)),
  );
  return (end === -1 ? lines : lines.slice(0, end))
    .filter((line) => !QUOTED_LINE.some((re) => re.test(line)))
    .join(' ')
    .replace(/[’‘]/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 4000);
}

/**
 * Whether a reply asks to leave the founder sequence. Only the reply's own
 * text counts (quoted and forwarded originals are cut off), matched against a
 * short list of opt-out phrases such as "unsubscribe", "stop" or "not
 * interested". A reply with no readable text counts as a stop request, so an
 * unreadable reply never keeps someone in the sequence.
 *
 * @param content - The received text and html bodies; neither is stored.
 */
export function isStopRequest(content: ReplyContent): boolean {
  const text = ownText(content);
  if (!text) return true;
  return STOP_PHRASES.some((phrase) => phrase.test(text));
}
