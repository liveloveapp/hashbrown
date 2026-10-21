/** Input for {@link renderPlainHtml} and {@link renderPlainText}. */
export interface PlainEmailBody {
  /** The message body; blank lines separate paragraphs. */
  text: string;
  /** The contact-bound unsubscribe URL string. */
  unsubscribeUrl: string;
  /** The sign-off line, such as `Brian`. */
  signature: string;
}

/** The largest HTML alternative, in characters, a recipient email may carry. */
export const PLAIN_HTML_MAXIMUM = 40_000;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const BODY_LINK_PATTERN = /https:\/\/[^\s<>()"'“”‘’\]}]+/gu;

const FORBIDDEN_HTML_ELEMENT_PATTERN =
  /<(?:img|picture|source|script|style|link|iframe|frame|object|embed|svg|video|audio|form|input|button|select|textarea|meta|base|template|math)\b/iu;
const HTML_EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=/iu;
const HTML_RESOURCE_ATTRIBUTE_PATTERN =
  /\s(?:src|srcset|style|background|poster|ping|formaction|action|data)\s*=/iu;
const HTML_TAG_PATTERN = /<\/?([a-z][a-z0-9]*)\b[^>]*>/giu;
const ALLOWED_HTML_ELEMENTS = new Set(['p', 'br', 'a']);
const HTML_ANCHOR_PATTERN = /<a\b([^>]*)>/giu;
const HTML_HREF_PATTERN = /\bhref\s*=\s*"([^"]*)"/iu;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) => HTML_ESCAPES[character] ?? character,
  );
}

function htmlLine(line: string): string {
  let rendered = '';
  let cursor = 0;
  for (const match of line.matchAll(BODY_LINK_PATTERN)) {
    const start = match.index;
    const trailing = /[.,;:!]+$/u.exec(match[0])?.[0] ?? '';
    const link = match[0].slice(0, match[0].length - trailing.length);
    rendered += escapeHtml(line.slice(cursor, start));
    rendered += `<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`;
    rendered += escapeHtml(trailing);
    cursor = start + match[0].length;
  }
  return rendered + escapeHtml(line.slice(cursor));
}

/**
 * Renders the text part of a recipient email: the body, the signature, and
 * the full unsubscribe URL.
 *
 * @param input - The body, signature, and unsubscribe URL.
 * @returns The plain-text message.
 */
export function renderPlainText(input: PlainEmailBody): string {
  return `${input.text}\n\n${input.signature}\n\n--\n\nYou can unsubscribe here: ${input.unsubscribeUrl}`;
}

/**
 * Renders a plain HTML alternative for the text part: the same paragraphs,
 * bare HTTPS links as anchors, and a one-word unsubscribe link instead of the
 * long signed URL. No layout, images, styles, or tracking.
 *
 * @param input - The body, signature, and unsubscribe URL.
 * @returns HTML that passes {@link assertPlainHtml}.
 */
export function renderPlainHtml(input: PlainEmailBody): string {
  const paragraphs = input.text
    .split('\n\n')
    .map((paragraph) => paragraph.split('\n').map(htmlLine).join('<br>'))
    .map((paragraph) => `<p>${paragraph}</p>`);
  const unsubscribe = escapeHtml(input.unsubscribeUrl);
  return [
    ...paragraphs,
    `<p>${escapeHtml(input.signature)}</p>`,
    '<p>--</p>',
    `<p>You can unsubscribe <a href="${unsubscribe}">here</a>.</p>`,
  ].join('\n');
}

/**
 * Validates an HTML alternative as a plain rendering of the text part: at
 * most {@link PLAIN_HTML_MAXIMUM} characters; only `p`, `br`, and `a`
 * elements; no images, scripts, styles, forms, comments, or doctype; no
 * event-handler or resource attributes; HTTPS hrefs only; and exactly one
 * anchor linking the unsubscribe URL.
 *
 * @param html - The HTML alternative.
 * @param unsubscribeUrl - The unsubscribe URL the text part carries.
 * @param field - The field name used in error messages.
 * @returns The trimmed HTML.
 * @throws When the HTML is not plain paragraphs and links.
 */
export function assertPlainHtml(
  html: string,
  unsubscribeUrl: string,
  field = 'html',
): string {
  if (typeof html !== 'string') throw new Error(`${field} is required`);
  const normalized = html.trim();
  if (
    normalized.length === 0 ||
    normalized.length > PLAIN_HTML_MAXIMUM ||
    /\0/u.test(normalized)
  ) {
    throw new Error(
      `${field} must contain between 1 and ${PLAIN_HTML_MAXIMUM} safe characters`,
    );
  }
  if (
    FORBIDDEN_HTML_ELEMENT_PATTERN.test(normalized) ||
    HTML_EVENT_HANDLER_PATTERN.test(normalized) ||
    HTML_RESOURCE_ATTRIBUTE_PATTERN.test(normalized) ||
    /<!--|<!doctype|<\?/iu.test(normalized)
  ) {
    throw new Error(`${field} must be plain paragraphs and links only`);
  }
  for (const match of normalized.matchAll(HTML_TAG_PATTERN)) {
    if (!ALLOWED_HTML_ELEMENTS.has((match[1] ?? '').toLowerCase())) {
      throw new Error(`${field} must be plain paragraphs and links only`);
    }
  }
  let unsubscribeAnchors = 0;
  for (const match of normalized.matchAll(HTML_ANCHOR_PATTERN)) {
    const href = HTML_HREF_PATTERN.exec(match[1] ?? '')?.[1];
    if (typeof href !== 'string' || !href.startsWith('https://')) {
      throw new Error(`${field} anchors must use HTTPS hrefs`);
    }
    if (href === unsubscribeUrl) unsubscribeAnchors += 1;
  }
  if (unsubscribeAnchors !== 1) {
    throw new Error(`${field} must link the unsubscribe URL exactly once`);
  }
  return normalized;
}
