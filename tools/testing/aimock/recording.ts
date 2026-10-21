import { join, resolve } from 'node:path';
import {
  type AimockHandle,
  type AimockProvider,
  startAimock,
} from './aimock-runner';

/**
 * Absolute path of the directory that holds recorded provider fixtures, laid
 * out as `<test-slug>/<provider>.json`.
 */
export const RECORDED_FIXTURES_ROOT: string = resolve(
  __dirname,
  'fixtures',
  'recorded',
);

/** Key handed to provider SDKs in replay, where aimock never checks it. */
const REPLAY_API_KEY = 'test-not-used';

const SECRET_NAME_PATTERNS: readonly RegExp[] = [
  /_KEY$/,
  /_SECRET/,
  /_TOKEN$/,
  /^AWS_/,
  /_ENDPOINT$/,
];

/** Configuration, not credentials: redacting these would corrupt recordings. */
const NON_SECRET_NAME_PATTERNS: readonly RegExp[] = [
  /_REGION$/,
  /_MODEL/,
  /_API_VERSION$/,
];

/**
 * Shorter values are too likely to appear by chance in a recording, and
 * scrubbing rewrites every recorded file.
 */
const MIN_SECRET_LENGTH = 12;

/**
 * Whether this run records fixtures from the real provider APIs.
 *
 * @param env - Environment to read; defaults to `process.env`.
 * @returns `true` only when `AIMOCK_RECORD` is exactly `'1'`.
 */
export function isRecording(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['AIMOCK_RECORD'] === '1';
}

/**
 * Turn a test name into the directory slug aimock records it under. An exact
 * copy of aimock's `slugifyTestId`, which aimock does not export.
 *
 * @param testName - The `X-Test-Id` value, usually the current test name.
 * @returns The slug aimock uses for `<fixturePath>/<slug>/<provider>.json`.
 */
export function recordedTestSlug(testName: string): string {
  return testName
    .replace(
      /^.*?\.(?:spec|test|e2e)\.(?:tsx|ts|jsx|js|mjs|cjs)(?=\s|›|$)\s*›?\s*/i,
      '',
    )
    .replace(/\s*[›>]\s*/g, '--')
    .replace(/[^\w-]/g, '-')
    .replace(/-{3,}/g, '--')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * Collect the credential values a recording must never contain.
 *
 * @param env - Environment to read, such as `process.env`.
 * @returns Every value of at least 12 characters of a variable named
 * `*_KEY`, `*_SECRET*`, `*_TOKEN`, `AWS_*` or `*_ENDPOINT`, except
 * configuration named `*_REGION`, `*_MODEL*` or `*_API_VERSION`.
 */
export function collectSecrets(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(
      ([name]) =>
        SECRET_NAME_PATTERNS.some((pattern) => pattern.test(name)) &&
        !NON_SECRET_NAME_PATTERNS.some((pattern) => pattern.test(name)),
    )
    .map(([, value]) => value ?? '')
    .filter((value) => value.length >= MIN_SECRET_LENGTH);
}

/**
 * Options for {@link startRecordedAimock}.
 */
export interface RecordedAimockOptions {
  /** The test's name; pass `expect.getState().currentTestName`. */
  readonly testName: string;
  /** Provider key aimock records the requests under. */
  readonly provider: AimockProvider;
  /** Real provider base URL, used only when recording. */
  readonly upstream: string;
  /** Recording file name; defaults to `${provider}.json` (Azure: `'openai.json'`). */
  readonly fileName?: string;
  /** Values scrubbed from recordings; defaults to `collectSecrets(process.env)`. */
  readonly secrets?: readonly string[];
  /**
   * Characters per streamed chunk in replay, for cases that need text split
   * across several events; defaults to aimock-runner's default.
   */
  readonly chunkSize?: number;
}

/**
 * aimock started for one recorded test.
 */
export interface RecordedAimock {
  /** The running aimock server. */
  readonly aimock: AimockHandle;
  /** Whether this run records from the real provider. */
  readonly recording: boolean;
  /** Headers every provider request must carry: `{ 'X-Test-Id': slug }`. */
  readonly headers: Readonly<Record<string, string>>;
  /**
   * Pick the API key for the provider client.
   *
   * @param realKey - The real key from the environment.
   * @returns `realKey` when recording, a placeholder otherwise.
   */
  apiKey(realKey: string | undefined): string;
}

/**
 * Start aimock for one test against its recorded fixture.
 *
 * Replay (the default) loads `RECORDED_FIXTURES_ROOT/<slug>/<fileName>`
 * strictly: a request with no recording gets a 503 naming the missing file.
 * With `AIMOCK_RECORD=1`, unmatched requests go to `upstream` and are recorded
 * there, with secrets scrubbed when the handle stops.
 *
 * @param options - The test, provider and upstream to record from.
 * @returns The running aimock plus the headers and key the client must use.
 */
export async function startRecordedAimock(
  options: RecordedAimockOptions,
): Promise<RecordedAimock> {
  const recording = isRecording();
  const slug = recordedTestSlug(options.testName);
  const fileName = options.fileName ?? `${options.provider}.json`;
  const fixturePath = join(RECORDED_FIXTURES_ROOT, slug, fileName);
  const aimock = await startAimock(
    recording
      ? {
          fixturePath,
          chunkSize: options.chunkSize,
          record: {
            providers: { [options.provider]: options.upstream },
            fixturePath: RECORDED_FIXTURES_ROOT,
            secrets: options.secrets ?? collectSecrets(process.env),
          },
        }
      : {
          fixturePath,
          chunkSize: options.chunkSize,
          strict: true,
          strictMissMessage:
            `No recorded fixture matched for test "${slug}" ` +
            `(provider ${options.provider}) in ${fixturePath}. ` +
            'Record it with AIMOCK_RECORD=1.',
        },
  );

  return {
    aimock,
    recording,
    headers: { 'X-Test-Id': slug },
    apiKey(realKey) {
      if (!recording) {
        return REPLAY_API_KEY;
      }
      if (!realKey) {
        throw new Error(
          `AIMOCK_RECORD=1 needs a real ${options.provider} API key for "${slug}".`,
        );
      }
      return realKey;
    },
  };
}
