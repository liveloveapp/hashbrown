import { createHmac, timingSafeEqual } from 'node:crypto';

import type { GrowthJob } from './models.ts';

const TOKEN_VERSION = 'g1';
const TOKEN_HMAC_BYTE_LENGTH = 32;
const TOKEN_CLOCK_SKEW_SECONDS = 300;
const MAX_OPTIONAL_FIELD_LENGTH = 100;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const OPTIONAL_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const UNKNOWN_KEY_SECRET = Buffer.alloc(TOKEN_HMAC_BYTE_LENGTH);
interface UnsubscribeActionUrlState {
  readonly contactId: string;
  readonly value: string;
}

const unsubscribeActionUrlValues = new WeakMap<
  object,
  UnsubscribeActionUrlState
>();

declare const unsubscribeActionUrlBrand: unique symbol;

/** Maximum age, in seconds, of a founder stop token (24 hours). */
export const FOUNDER_STOP_TOKEN_MAX_AGE_SECONDS = 24 * 60 * 60;
/** Maximum age, in seconds, of a founder install-approval token (7 days). */
export const FOUNDER_APPROVE_INSTALL_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** The action a growth token authorizes. */
export type GrowthTokenPurpose =
  'unsubscribe' | 'founder_stop' | 'founder_approve_install';

/** A versioned HMAC signing key; the secret must be at least 32 bytes. */
export interface GrowthTokenKey {
  version: number;
  secret: string | Uint8Array;
}

/** The active signing key plus previous keys still accepted for verification. */
export interface GrowthTokenKeyring {
  active: GrowthTokenKey;
  previous?: readonly GrowthTokenKey[];
}

/** Input for `createGrowthActionToken`. */
export interface CreateGrowthActionTokenInput {
  /** Contact id for unsubscribe/founder_stop; the first install observation id for founder_approve_install. */
  contactId: string;
  purpose: GrowthTokenPurpose;
  issuedAt: Date;
  eventNonce?: string;
  reason?: string;
}

/** Input for an unsubscribe URL: token input without a purpose. */
export type CreateUnsubscribeActionUrlInput = Omit<
  CreateGrowthActionTokenInput,
  'purpose'
>;

/** Opaque, branded unsubscribe URL; read it with `unsubscribeActionUrlValue`. */
export interface UnsubscribeActionUrl {
  readonly [unsubscribeActionUrlBrand]: true;
}

/** The verified contents of a growth action token. */
export interface GrowthActionTokenPayload {
  contactId: string;
  purpose: GrowthTokenPurpose;
  keyVersion: number;
  issuedAt: Date;
  eventNonce?: string;
  reason?: string;
}

/** Options for `verifyGrowthActionToken`. */
export interface VerifyGrowthActionTokenOptions {
  expectedPurpose: GrowthTokenPurpose;
  keyring: GrowthTokenKeyring;
  now?: Date;
  maxAgeSeconds?: number;
}

/** Environment variables read by `loadGrowthTokenKeyring`. */
export interface GrowthTokenEnvironment {
  GROWTH_ACTION_TOKEN_ACTIVE_VERSION?: string;
  GROWTH_ACTION_TOKEN_ACTIVE_SECRET?: string;
  GROWTH_ACTION_TOKEN_PREVIOUS_KEYS?: string;
}

interface WirePayload {
  c: string;
  i: number;
  k: number;
  n?: string;
  p: GrowthTokenPurpose;
  r?: string;
}

function assertKey(key: GrowthTokenKey): void {
  if (
    !Number.isSafeInteger(key.version) ||
    key.version <= 0 ||
    key.version > 32_767
  ) {
    throw new Error(
      'Growth action token key version must be an integer between 1 and 32767',
    );
  }
  const secretLength =
    typeof key.secret === 'string'
      ? Buffer.byteLength(key.secret, 'utf8')
      : key.secret.byteLength;
  if (secretLength < TOKEN_HMAC_BYTE_LENGTH) {
    throw new Error(
      'Growth action token HMAC secret must contain at least 32 bytes',
    );
  }
}

function validatedKeys(keyring: GrowthTokenKeyring): readonly GrowthTokenKey[] {
  const keys = [keyring.active, ...(keyring.previous ?? [])];
  const versions = new Set<number>();
  for (const key of keys) {
    assertKey(key);
    if (versions.has(key.version)) {
      throw new Error(
        `Duplicate growth action token key version: ${key.version}`,
      );
    }
    versions.add(key.version);
  }
  return keys;
}

function validDate(field: string, value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date`);
  }
  return value;
}

function optionalBoundedText(
  field: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_OPTIONAL_FIELD_LENGTH ||
    !OPTIONAL_IDENTIFIER_PATTERN.test(normalized)
  ) {
    throw new Error(
      `${field} must contain between 1 and ${MAX_OPTIONAL_FIELD_LENGTH} characters`,
    );
  }
  return normalized;
}

function assertContactId(contactId: string): string {
  const normalized = contactId.toLowerCase();
  if (!UUID_V4_PATTERN.test(normalized)) {
    throw new Error('Growth action token contact ID must be a UUID v4');
  }
  return normalized;
}

function assertPurpose(purpose: unknown): GrowthTokenPurpose {
  if (
    purpose !== 'unsubscribe' &&
    purpose !== 'founder_stop' &&
    purpose !== 'founder_approve_install'
  ) {
    throw new Error('Unsupported growth action token purpose');
  }
  return purpose;
}

/** Validates a bare HTTPS origin (no path, credentials, query or hash) and returns it. */
export function normalizeGrowthPublicActionOrigin(value: string): string {
  if (typeof value !== 'string' || value.trim() !== value) {
    throw new Error('Growth public action origin must be a bare HTTPS origin');
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.origin !== value
    ) {
      throw new Error('invalid origin');
    }
    return url.origin;
  } catch {
    throw new Error('Growth public action origin must be a bare HTTPS origin');
  }
}

function canonicalPayload(payload: WirePayload): string {
  return JSON.stringify({
    c: payload.c,
    i: payload.i,
    k: payload.k,
    ...(payload.n === undefined ? {} : { n: payload.n }),
    p: payload.p,
    ...(payload.r === undefined ? {} : { r: payload.r }),
  });
}

function sign(encodedPayload: string, secret: string | Uint8Array): string {
  return createHmac('sha256', secret)
    .update(`${TOKEN_VERSION}.${encodedPayload}`, 'utf8')
    .digest('base64url');
}

/** Creates a signed `g1` action token for a contact using the given key. */
export function createGrowthActionToken(
  input: CreateGrowthActionTokenInput,
  key: GrowthTokenKey,
): string {
  assertKey(key);
  const issuedAt = validDate('issuedAt', input.issuedAt);
  const wirePayload: WirePayload = {
    c: assertContactId(input.contactId),
    i: issuedAt.getTime(),
    k: key.version,
    ...(input.eventNonce === undefined
      ? {}
      : { n: optionalBoundedText('Event nonce', input.eventNonce) }),
    p: assertPurpose(input.purpose),
    ...(input.reason === undefined
      ? {}
      : { r: optionalBoundedText('Reason', input.reason) }),
  };
  const encodedPayload = Buffer.from(
    canonicalPayload(wirePayload),
    'utf8',
  ).toString('base64url');
  return `${TOKEN_VERSION}.${encodedPayload}.${sign(
    encodedPayload,
    key.secret,
  )}`;
}

/** Creates a branded unsubscribe URL (`/_/unsubscribe?token=...`) bound to its contact. */
export function createUnsubscribeActionUrl(
  input: CreateUnsubscribeActionUrlInput,
  key: GrowthTokenKey,
  publicActionOrigin: string,
): UnsubscribeActionUrl {
  const contactId = assertContactId(input.contactId);
  const origin = normalizeGrowthPublicActionOrigin(publicActionOrigin);
  const token = createGrowthActionToken(
    { ...input, contactId, purpose: 'unsubscribe' },
    key,
  );
  const actionUrl = Object.freeze({}) as UnsubscribeActionUrl;
  unsubscribeActionUrlValues.set(
    actionUrl,
    Object.freeze({
      contactId,
      value: `${origin}/_/unsubscribe?token=${token}`,
    }),
  );
  return actionUrl;
}

/**
 * Creates a retry-stable unsubscribe URL using the job's immutable creation time
 * and identity. Retries must retain the same signing key and public origin.
 *
 * @throws When the job has no contact or its token input is invalid.
 */
export function createUnsubscribeActionUrlForJob(
  job: Pick<GrowthJob, 'id' | 'contactId' | 'createdAt'>,
  key: GrowthTokenKey,
  publicActionOrigin: string,
): UnsubscribeActionUrl {
  if (job.contactId === null)
    throw new Error('Job unsubscribe URL requires a contact');
  return createUnsubscribeActionUrl(
    {
      contactId: job.contactId,
      issuedAt: job.createdAt,
      eventNonce: `job:${job.id}`,
    },
    key,
    publicActionOrigin,
  );
}

/** Returns the URL string of a constructed unsubscribe action URL. */
export function unsubscribeActionUrlValue(value: UnsubscribeActionUrl): string {
  if (typeof value !== 'object' || value === null) {
    throw new Error('A constructed unsubscribe action URL is required');
  }
  const state = unsubscribeActionUrlValues.get(value);
  if (!state) {
    throw new Error('A constructed unsubscribe action URL is required');
  }
  return state.value;
}

/** Returns the URL string, throwing unless it is bound to the given contact. */
export function unsubscribeActionUrlValueForContact(
  value: UnsubscribeActionUrl,
  contactId: string,
): string {
  const state =
    typeof value === 'object' && value !== null
      ? unsubscribeActionUrlValues.get(value)
      : undefined;
  if (!state) {
    throw new Error('A constructed unsubscribe action URL is required');
  }
  if (state.contactId !== assertContactId(contactId)) {
    throw new Error('Unsubscribe action URL contact binding does not match');
  }
  return state.value;
}

function fixedWidthHmac(value: string): { bytes: Buffer; valid: boolean } {
  const syntacticallyValid =
    value.length === 43 && BASE64URL_PATTERN.test(value);
  const decoded = syntacticallyValid
    ? Buffer.from(value, 'base64url')
    : Buffer.alloc(0);
  const bytes = Buffer.alloc(TOKEN_HMAC_BYTE_LENGTH);
  decoded.copy(bytes, 0, 0, TOKEN_HMAC_BYTE_LENGTH);
  return {
    bytes,
    valid:
      syntacticallyValid &&
      decoded.length === TOKEN_HMAC_BYTE_LENGTH &&
      decoded.toString('base64url') === value,
  };
}

/** Constant-time comparison of two base64url HMACs of fixed width. */
export function compareTokenHmac(left: string, right: string): boolean {
  const leftHmac = fixedWidthHmac(left);
  const rightHmac = fixedWidthHmac(right);
  const equal = timingSafeEqual(leftHmac.bytes, rightHmac.bytes);
  return equal && leftHmac.valid && rightHmac.valid;
}

function parseWirePayload(encodedPayload: string): WirePayload | null {
  if (
    encodedPayload.length === 0 ||
    encodedPayload.length > 1_024 ||
    !BASE64URL_PATTERN.test(encodedPayload)
  ) {
    return null;
  }
  try {
    const decoded = Buffer.from(encodedPayload, 'base64url');
    if (decoded.toString('base64url') !== encodedPayload) return null;
    const candidate = JSON.parse(decoded.toString('utf8')) as unknown;
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      return null;
    }
    const record = candidate as Record<string, unknown>;
    const allowedKeys = new Set(['c', 'i', 'k', 'n', 'p', 'r']);
    if (Object.keys(record).some((key) => !allowedKeys.has(key))) return null;
    if (
      typeof record['c'] !== 'string' ||
      !UUID_V4_PATTERN.test(record['c']) ||
      !Number.isSafeInteger(record['i']) ||
      (record['i'] as number) < 0 ||
      !Number.isSafeInteger(record['k']) ||
      (record['k'] as number) <= 0 ||
      (record['k'] as number) > 32_767 ||
      (record['p'] !== 'unsubscribe' &&
        record['p'] !== 'founder_stop' &&
        record['p'] !== 'founder_approve_install') ||
      (record['n'] !== undefined &&
        (typeof record['n'] !== 'string' ||
          record['n'].length === 0 ||
          record['n'].length > MAX_OPTIONAL_FIELD_LENGTH ||
          !OPTIONAL_IDENTIFIER_PATTERN.test(record['n']))) ||
      (record['r'] !== undefined &&
        (typeof record['r'] !== 'string' ||
          record['r'].length === 0 ||
          record['r'].length > MAX_OPTIONAL_FIELD_LENGTH ||
          !OPTIONAL_IDENTIFIER_PATTERN.test(record['r'])))
    ) {
      return null;
    }
    const payload: WirePayload = {
      c: record['c'],
      i: record['i'] as number,
      k: record['k'] as number,
      ...(record['n'] === undefined ? {} : { n: record['n'] as string }),
      p: record['p'],
      ...(record['r'] === undefined ? {} : { r: record['r'] as string }),
    };
    return canonicalPayload(payload) === decoded.toString('utf8')
      ? payload
      : null;
  } catch {
    return null;
  }
}

/** Verifies a token in constant time; returns the payload, or `null` for any failure. */
export function verifyGrowthActionToken(
  token: string,
  options: VerifyGrowthActionTokenOptions,
): GrowthActionTokenPayload | null {
  const keys = validatedKeys(options.keyring);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [version, encodedPayload, providedHmac] = parts;
  if (!version || !encodedPayload || !providedHmac) return null;

  const wirePayload = parseWirePayload(encodedPayload);
  const signingKey = wirePayload
    ? keys.find(({ version: keyVersion }) => keyVersion === wirePayload.k)
    : undefined;
  const expectedHmac = sign(
    encodedPayload,
    signingKey?.secret ?? UNKNOWN_KEY_SECRET,
  );
  const signatureValid = compareTokenHmac(providedHmac, expectedHmac);
  if (
    !signatureValid ||
    version !== TOKEN_VERSION ||
    !wirePayload ||
    !signingKey
  ) {
    return null;
  }

  const now = validDate('now', options.now ?? new Date());
  if (
    options.maxAgeSeconds !== undefined &&
    (!Number.isSafeInteger(options.maxAgeSeconds) || options.maxAgeSeconds <= 0)
  ) {
    throw new Error('maxAgeSeconds must be a positive integer');
  }
  const nowMilliseconds = now.getTime();
  if (
    wirePayload.p !== options.expectedPurpose ||
    wirePayload.i > nowMilliseconds + TOKEN_CLOCK_SKEW_SECONDS * 1_000 ||
    (options.maxAgeSeconds !== undefined &&
      nowMilliseconds - wirePayload.i > options.maxAgeSeconds * 1_000)
  ) {
    return null;
  }

  return {
    contactId: wirePayload.c,
    purpose: wirePayload.p,
    keyVersion: wirePayload.k,
    issuedAt: new Date(wirePayload.i),
    ...(wirePayload.n === undefined ? {} : { eventNonce: wirePayload.n }),
    ...(wirePayload.r === undefined ? {} : { reason: wirePayload.r }),
  };
}

/** Builds the idempotency event key for a stop action from a verified payload. */
export function growthStopEventKey(payload: GrowthActionTokenPayload): string {
  return [
    'token',
    payload.purpose,
    payload.contactId,
    payload.issuedAt.getTime(),
    ...(payload.eventNonce ? [payload.eventNonce] : []),
  ].join(':');
}

function parseVersion(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/u.test(value)) {
    throw new Error(`${label} is required and must be a positive integer`);
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return version;
}

/** Loads the keyring from `GROWTH_ACTION_TOKEN_ACTIVE_SECRET`, `_ACTIVE_VERSION` and `_PREVIOUS_KEYS`. */
export function loadGrowthTokenKeyring(
  environment: GrowthTokenEnvironment = process.env as GrowthTokenEnvironment,
): GrowthTokenKeyring {
  const activeVersion = parseVersion(
    environment.GROWTH_ACTION_TOKEN_ACTIVE_VERSION,
    'GROWTH_ACTION_TOKEN_ACTIVE_VERSION',
  );
  const activeSecret = environment.GROWTH_ACTION_TOKEN_ACTIVE_SECRET;
  if (!activeSecret) {
    throw new Error('GROWTH_ACTION_TOKEN_ACTIVE_SECRET is required');
  }

  let previous: GrowthTokenKey[] = [];
  const previousValue = environment.GROWTH_ACTION_TOKEN_PREVIOUS_KEYS;
  if (previousValue) {
    try {
      const parsed = JSON.parse(previousValue) as unknown;
      if (!Array.isArray(parsed)) throw new Error('not an array');
      previous = parsed.map((candidate) => {
        if (
          candidate === null ||
          typeof candidate !== 'object' ||
          Array.isArray(candidate)
        ) {
          throw new Error('not an object');
        }
        const record = candidate as Record<string, unknown>;
        if (
          typeof record['version'] !== 'number' ||
          typeof record['secret'] !== 'string'
        ) {
          throw new Error('invalid key');
        }
        return { version: record['version'], secret: record['secret'] };
      });
    } catch {
      throw new Error(
        'Growth action token previous keys (GROWTH_ACTION_TOKEN_PREVIOUS_KEYS) must be a JSON array of version/secret keys',
      );
    }
  }

  const keyring: GrowthTokenKeyring = {
    active: { version: activeVersion, secret: activeSecret },
    ...(previous.length === 0 ? {} : { previous }),
  };
  validatedKeys(keyring);
  return keyring;
}
