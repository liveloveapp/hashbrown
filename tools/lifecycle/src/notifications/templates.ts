import { z } from 'zod';

import { normalizeCampaignDraft } from '../campaign/templates.ts';
import {
  GROWTH_SCORE_POLICY,
  normalizeGrowthPublicActionOrigin,
} from '../growth.ts';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const OPTIONAL_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const FOUNDER_STOP_PATH = '/_/growth/stop';
const MAX_MESSAGE_LENGTH = 1_000;

const SCORE_REASON_CODES = Object.keys(GROWTH_SCORE_POLICY) as [
  string,
  ...string[],
];

interface FounderStopWirePayload {
  c: string;
  i: number;
  k: number;
  n?: string;
  p: 'founder_stop';
  r?: string;
}

function optionalIdentifier(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === 'string' &&
      value.length >= 1 &&
      value.length <= 100 &&
      OPTIONAL_IDENTIFIER_PATTERN.test(value))
  );
}

function canonicalFounderStopPayload(payload: FounderStopWirePayload): string {
  return JSON.stringify({
    c: payload.c,
    i: payload.i,
    k: payload.k,
    ...(payload.n === undefined ? {} : { n: payload.n }),
    p: payload.p,
    ...(payload.r === undefined ? {} : { r: payload.r }),
  });
}

function validFounderStopTokenEnvelope(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [version, encodedPayload, signature] = parts;
  if (
    version !== 'g1' ||
    !encodedPayload ||
    encodedPayload.length > 1_024 ||
    !BASE64URL_PATTERN.test(encodedPayload) ||
    !signature ||
    signature.length !== 43 ||
    !BASE64URL_PATTERN.test(signature)
  ) {
    return false;
  }

  try {
    const signatureBytes = Buffer.from(signature, 'base64url');
    if (
      signatureBytes.length !== 32 ||
      signatureBytes.toString('base64url') !== signature
    ) {
      return false;
    }
    const payloadBytes = Buffer.from(encodedPayload, 'base64url');
    if (payloadBytes.toString('base64url') !== encodedPayload) return false;
    const decoded = payloadBytes.toString('utf8');
    const candidate = JSON.parse(decoded) as unknown;
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      return false;
    }
    const record = candidate as Record<string, unknown>;
    const allowedKeys = new Set(['c', 'i', 'k', 'n', 'p', 'r']);
    if (Object.keys(record).some((key) => !allowedKeys.has(key))) return false;
    if (
      typeof record['c'] !== 'string' ||
      !UUID_V4_PATTERN.test(record['c']) ||
      !Number.isSafeInteger(record['i']) ||
      (record['i'] as number) < 0 ||
      !Number.isSafeInteger(record['k']) ||
      (record['k'] as number) <= 0 ||
      (record['k'] as number) > 32_767 ||
      record['p'] !== 'founder_stop' ||
      !optionalIdentifier(record['n']) ||
      !optionalIdentifier(record['r'])
    ) {
      return false;
    }
    const payload: FounderStopWirePayload = {
      c: record['c'],
      i: record['i'] as number,
      k: record['k'] as number,
      ...(record['n'] === undefined ? {} : { n: record['n'] as string }),
      p: record['p'],
      ...(record['r'] === undefined ? {} : { r: record['r'] as string }),
    };
    return canonicalFounderStopPayload(payload) === decoded;
  } catch {
    return false;
  }
}

function validFounderStopUrl(value: string, origin: string): boolean {
  try {
    const url = new URL(value);
    const entries = [...url.searchParams.entries()];
    const token = entries[0]?.[1] ?? '';
    return (
      value.length <= 1_500 &&
      url.origin === origin &&
      url.pathname === FOUNDER_STOP_PATH &&
      url.username === '' &&
      url.password === '' &&
      url.hash === '' &&
      entries.length === 1 &&
      entries[0]?.[0] === 'token' &&
      token.length <= 1_200 &&
      validFounderStopTokenEnvelope(token) &&
      !/[\r\n]/u.test(value)
    );
  } catch {
    return false;
  }
}

const DraftPreviewSchema = z
  .object({
    subject: z.string().min(1).max(80),
    body: z.string().min(1).max(1_200),
  })
  .strict();

const InternalNotificationInputSchema = z
  .object({
    scoreVersion: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:+-]*$/u),
    scoreReasons: z
      .array(
        z
          .object({
            code: z.enum(SCORE_REASON_CODES),
            points: z.number().int(),
          })
          .passthrough(),
      )
      .max(10),
    submission: z
      .object({
        messagePresent: z.boolean(),
        messageLength: z.number().int().min(0).max(100_000),
        message: z.string().max(100_000).optional(),
      })
      .strict(),
    drafts: z.array(DraftPreviewSchema).length(3),
    /** The public action origin the stop URL must be minted under. */
    origin: z.string().refine(
      (value) => {
        try {
          return normalizeGrowthPublicActionOrigin(value) === value;
        } catch {
          return false;
        }
      },
      { message: 'origin must be a bare HTTPS origin' },
    ),
    founderStopUrl: z.string().min(1).max(1_500),
  })
  .strict()
  .superRefine((input, context) => {
    if (!validFounderStopUrl(input.founderStopUrl, input.origin)) {
      context.addIssue({
        code: 'custom',
        path: ['founderStopUrl'],
        message:
          'founder stop URL must be a canonical token URL on the public action origin',
      });
    }
  });

/** Input for {@link renderInternalNotificationSummary}. */
export type InternalNotificationInput = z.input<
  typeof InternalNotificationInputSchema
>;

const DRAFT_PREVIEW_LENGTH = 180;

function compactPreview(value: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  return compact.length <= DRAFT_PREVIEW_LENGTH
    ? compact
    : `${compact.slice(0, DRAFT_PREVIEW_LENGTH - 1).trimEnd()}…`;
}

function draftPreview(
  draft: { subject: string; body: string },
  index: number,
): string {
  try {
    const normalized = normalizeCampaignDraft(draft, { maxLinks: 2 });
    return `Draft ${index + 1} — ${normalized.subject}\n${compactPreview(
      normalized.body,
    )}`;
  } catch {
    return `Draft ${index + 1} — rejected by recipient-copy checks`;
  }
}

/** Strips control characters (keeping newlines) and bounds the text. */
function boundedMessage(message: string): string {
  return [
    ...message
      .replace(/\r\n?/gu, '\n')
      .replace(/\t/gu, ' ')
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/gu, ''),
  ]
    .slice(0, MAX_MESSAGE_LENGTH)
    .join('');
}

function quoted(message: string): string {
  return message
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n');
}

/**
 * Renders the plain-text founder notification for an unstuck submission: the
 * score, the submitted text as a bounded quote (the only place it goes), three
 * draft previews and a canonical short-lived stop URL.
 */
export function renderInternalNotificationSummary(candidate: unknown): string {
  const input = InternalNotificationInputSchema.parse(candidate);
  const reasons =
    input.scoreReasons.length === 0
      ? '- none'
      : input.scoreReasons
          .map((reason) => `- ${reason.code}: ${reason.points} points`)
          .join('\n');
  const previews = input.drafts
    .map((draft, index) => draftPreview(draft, index))
    .join('\n\n');
  const message =
    input.submission.messagePresent && input.submission.message
      ? boundedMessage(input.submission.message)
      : '';

  return [
    'Review only',
    'This summary does not authorize or schedule any recipient email beyond the sequence the submitter approved.',
    '',
    `Message: ${
      input.submission.messagePresent
        ? `${input.submission.messageLength} characters`
        : 'none'
    }`,
    ...(message ? ['', 'Where are you stuck?', quoted(message)] : []),
    '',
    `Score version: ${input.scoreVersion}`,
    'Score reasons:',
    reasons,
    '',
    'Draft previews:',
    previews,
    '',
    'Review or stop this contact (short-lived URL):',
    input.founderStopUrl,
  ].join('\n');
}
