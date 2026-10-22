/** A subject and plain-text body for one recipient message. */
export interface CampaignDraft {
  readonly subject: string;
  readonly body: string;
}

/** The three founder-sequence steps; `immediate` is step 1. */
export type CampaignStep = 'immediate' | 'day-3' | 'day-8';

/** Options for the draft linter. */
export interface CampaignDraftOptions {
  /** How many links the message may carry. Only `day-8` uses 2. */
  readonly maxLinks?: 1 | 2;
}

/**
 * First-party redirect to Brian's Google Calendar appointment page. Recipient
 * copy links here instead of the calendar host so every URL matches the
 * sending domain.
 */
export const FOUNDER_BOOKING_URL = 'https://hashbrown.dev/call';

/** Every link recipient copy may carry. */
export const APPROVED_CAMPAIGN_LINKS: ReadonlySet<string> = new Set([
  'https://hashbrown.dev/docs',
  'https://hashbrown.dev/unstuck',
  'https://threadplane.ai',
  FOUNDER_BOOKING_URL,
]);

const URL_PATTERN = /https?:\/\/[^\s<>()"'“”‘’\]}]+/giu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const HTML_PATTERN = /(?:<\/?[a-z][^>]*>|<!doctype\b[^>]*>|<!--[\s\S]*?-->)/iu;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]*\)/u;
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\([^)]*\)/u;
const HEADER_PATTERN = /^[ \t]*(?:bcc|cc|from|reply-to|subject|to):/imu;
const SURVEILLANCE_PATTERN =
  /\b(?:I saw you|we saw you|I noticed you|we noticed|we observed you|based on your activity|your activity|tracking|telemetry|page[ -]?view|analytics event|your (?:product )?(?:usage|behavior|activity|signals?) (?:show(?:s|ed)?|reveal(?:s|ed)?|indicate(?:s|d)?|suggest(?:s|ed)?))\b/iu;
const CALENDAR_PATTERN =
  /(?:calendly\.com|cal\.com|calendar\.google\.com|\/(?:book|calendar|meeting|schedule)(?:\/|\?|$))/iu;
const TRACKING_PATTERN =
  /(?:pixel|beacon|open\.gif|utm_(?:campaign|content|medium|source)|\/(?:click|redirect|track)(?:\/|\?|$))/iu;
const PROTOCOL_RELATIVE_LINK_PATTERN =
  /(?:^|[^A-Za-z0-9/:])\/\/[^\s)\]}'"”’]+/u;
const DOT_RELATIVE_LINK_PATTERN =
  /(?:^|[^A-Za-z0-9])\.{1,2}\/[a-z0-9][^\s)\]}'"”’]*/iu;
const RELATIVE_LINK_PATTERN =
  /(?:^|[^A-Za-z0-9/:])\/(?!\/)[a-z0-9][^\s)\]}'"”’]*/iu;
const UNSUPPORTED_SCHEME_PATTERN =
  /(?:^|[^A-Za-z0-9])(?!(?:https?):)[a-z][a-z0-9+.-]*:[^\s)\]}'"”’]+/iu;

function normalizeSubject(subject: string): string {
  return subject.trim().replace(/[ \t]+/gu, ' ');
}

function normalizeBody(body: string): string {
  return body
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function linksIn(value: string): string[] {
  return (value.match(URL_PATTERN) ?? []).map((link) =>
    link.replace(/[.,;:!]+$/u, ''),
  );
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

/**
 * Lists every rule a recipient draft breaks; an empty list means the draft may
 * be sent. Rules: at most 120 words, one question, subject at most 80
 * characters with no URL or newline, body at most 1200 characters, no HTML,
 * markdown, email address or injected header, no surveillance, calendar-host or
 * click-wrapper markup, and links only from {@link APPROVED_CAMPAIGN_LINKS}
 * (at most `maxLinks`, default 1).
 */
export function campaignDraftViolations(
  candidate: unknown,
  options: CampaignDraftOptions = {},
): string[] {
  const maxLinks = options.maxLinks ?? 1;
  const violations: string[] = [];
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate)
  ) {
    return ['draft must be an object'];
  }

  const record = candidate as Record<string, unknown>;
  const extraFields = Object.keys(record).filter(
    (field) => field !== 'subject' && field !== 'body',
  );
  if (extraFields.length > 0) violations.push('draft contains unknown fields');
  if (typeof record['subject'] !== 'string') {
    violations.push('subject must be a string');
  }
  if (typeof record['body'] !== 'string') {
    violations.push('body must be a string');
  }
  if (
    typeof record['subject'] !== 'string' ||
    typeof record['body'] !== 'string'
  ) {
    return violations;
  }

  const rawSubject = record['subject'];
  const rawBody = record['body'];
  const subject = normalizeSubject(rawSubject);
  const body = normalizeBody(rawBody);
  const message = `${subject}\n${body}`;
  const links = linksIn(message);

  if (subject.length === 0) violations.push('subject is empty');
  if (subject.length > 80) violations.push('subject exceeds 80 characters');
  if (body.length === 0) violations.push('body is empty');
  if (rawBody.length > 1_200) violations.push('body exceeds 1200 characters');
  if (/[\r\n]/u.test(rawSubject)) violations.push('subject contains a newline');
  if (linksIn(subject).length > 0) violations.push('subject contains a URL');
  if (wordCount(body) > 120) violations.push('body exceeds 120 words');
  if ((body.match(/\?/gu) ?? []).length > 1) {
    violations.push('body contains more than one question');
  }
  if (links.length > maxLinks) {
    violations.push(
      maxLinks === 1
        ? 'message contains more than one link'
        : `message contains more than ${maxLinks} links`,
    );
  }
  if (links.some((link) => !APPROVED_CAMPAIGN_LINKS.has(link))) {
    violations.push('message contains an unapproved link');
  }
  if (HTML_PATTERN.test(message)) violations.push('message contains HTML');
  if (MARKDOWN_IMAGE_PATTERN.test(message)) {
    violations.push('message contains markdown image markup');
  }
  if (MARKDOWN_LINK_PATTERN.test(message)) {
    violations.push('message contains markdown link markup');
  }
  if (HEADER_PATTERN.test(message)) {
    violations.push('message contains an injected mail header');
  }
  if (EMAIL_PATTERN.test(message)) violations.push('message contains an email');
  if (SURVEILLANCE_PATTERN.test(message)) {
    violations.push('message contains surveillance language');
  }
  if (CALENDAR_PATTERN.test(message)) {
    violations.push('message contains a calendar link');
  }
  if (TRACKING_PATTERN.test(message)) {
    violations.push('message contains click-wrapper or pixel markup');
  }
  if (PROTOCOL_RELATIVE_LINK_PATTERN.test(message)) {
    violations.push('message contains a protocol-relative link');
  }
  if (DOT_RELATIVE_LINK_PATTERN.test(message)) {
    violations.push('message contains a dot-relative link');
  }
  if (RELATIVE_LINK_PATTERN.test(message)) {
    violations.push('message contains a relative link');
  }
  if (UNSUPPORTED_SCHEME_PATTERN.test(message)) {
    violations.push('message contains an unsupported URL scheme');
  }

  return [...new Set(violations)];
}

/**
 * Lints a draft and returns it with whitespace normalized; throws listing the
 * violations when it fails.
 */
export function normalizeCampaignDraft(
  candidate: unknown,
  options: CampaignDraftOptions = {},
): CampaignDraft {
  const violations = campaignDraftViolations(candidate, options);
  if (violations.length > 0) {
    throw new Error(`Invalid campaign draft: ${violations.join('; ')}`);
  }
  const draft = candidate as CampaignDraft;
  return {
    subject: normalizeSubject(draft.subject),
    body: normalizeBody(draft.body),
  };
}

// The job handler adds the greeting and the signature; bodies here exclude
// both. Step one carries no link, so the call to action is a reply.
const CAMPAIGN_TEMPLATES: Record<CampaignStep, CampaignDraft> = {
  immediate: {
    subject: 'Engineer to engineer',
    body: `Saw you were checking out Hashbrown and wanted to drop a quick note.\n\nI'm the founding engineer, and I'm offering short engineer-to-engineer sessions to think through your generative UI, unblock whatever's in the way, and avoid the common mistakes. No sales, just getting you going.\n\nWhat are you building?`,
  },
  'day-3': {
    subject: 'Get your generative UI working',
    body: `Even with agents writing much of our code, teams still get stuck: the first stream, the first tool call, the first component the model renders.\n\nI can work through any of it with you in a 30-minute hands-on session. Fix the bug, get your code working.\n\nNo sales. Just a founding engineer meeting with you and your team.\n\nBook a time with me:\n${FOUNDER_BOOKING_URL}`,
  },
  'day-8': {
    subject: 'One last note from the Hashbrown founder',
    body: `One last note.\n\nI'd still like to get on a call to help you fix any bugs and hear what would make Hashbrown better.\n\nAnd if what you actually need is a finished chat UI rather than a headless one, threadplane is ours too, built on Hashbrown, with threads, approvals, and tool progress out of the box: https://threadplane.ai\n\nGrab some time on my calendar: ${FOUNDER_BOOKING_URL}\n\nThis is my last automated follow-up.`,
  },
};

/**
 * Renders and lints the template for a sequence step. Only `day-8` may carry
 * two links.
 */
export function renderCampaignTemplate(step: CampaignStep): CampaignDraft {
  const template = CAMPAIGN_TEMPLATES[step];
  if (!template) throw new Error(`Unknown campaign step: ${String(step)}`);
  return normalizeCampaignDraft(template, {
    maxLinks: step === 'day-8' ? 2 : 1,
  });
}
