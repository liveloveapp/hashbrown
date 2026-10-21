import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { startBedrockConverseShim } from './bedrock-converse-shim';
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

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Find the recorded fixtures whose response carries no model output: no
 * non-blank text, no tool calls and no reasoning. aimock records a failed
 * upstream call (a 4xx or 5xx) this way, so such a fixture means the
 * recording is unusable.
 *
 * @param recording - A parsed recording file, `{ fixtures: [...] }`.
 * @returns The indexes of the empty fixtures; `[0]` when the file holds no
 * fixtures at all.
 */
export function emptyRecordedResponses(recording: unknown): number[] {
  const fixtures =
    recording !== null &&
    typeof recording === 'object' &&
    'fixtures' in recording &&
    Array.isArray(recording.fixtures)
      ? (recording.fixtures as unknown[])
      : [];
  if (fixtures.length === 0) {
    return [0];
  }

  return fixtures.flatMap((fixture, index) => {
    const response =
      fixture !== null && typeof fixture === 'object' && 'response' in fixture
        ? (fixture.response as Record<string, unknown> | null)
        : null;
    const hasOutput =
      hasText(response?.['content']) ||
      hasText(response?.['reasoning']) ||
      (Array.isArray(response?.['toolCalls']) &&
        response['toolCalls'].length > 0);
    return hasOutput ? [] : [index];
  });
}

/**
 * Delete a recording that holds an empty response and throw, so a record run
 * that captured an upstream failure fails instead of committing it.
 */
function rejectEmptyRecording(
  fixturePath: string,
  slug: string,
  provider: AimockProvider,
): void {
  if (!existsSync(fixturePath)) {
    return;
  }
  const empty = emptyRecordedResponses(
    JSON.parse(readFileSync(fixturePath, 'utf8')),
  );
  if (empty.length === 0) {
    return;
  }

  rmSync(fixturePath);
  const slugDir = dirname(fixturePath);
  if (readdirSync(slugDir).length === 0) {
    rmSync(slugDir, { recursive: true });
  }
  throw new Error(
    `Recorded an empty ${provider} response for "${slug}" ` +
      `(fixture ${empty.join(', ')}); the upstream call probably failed. ` +
      `Deleted ${fixturePath}.`,
  );
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
 * strictly: a request with no recording gets a 503 naming the missing file,
 * and responses stream without the recorded latency.
 * With `AIMOCK_RECORD=1`, unmatched requests go to `upstream` and are recorded
 * there, with secrets scrubbed when the handle stops. Stopping then fails, and
 * deletes the recording, when it holds a response with no text, tool calls or
 * reasoning (see {@link emptyRecordedResponses}). Bedrock records through a
 * local proxy that works around an aimock framing bug (see
 * `bedrock-converse-shim.ts`); replay never uses it.
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
  // Workaround for aimock recording Bedrock Converse streams as empty; see
  // bedrock-converse-shim.ts. Record mode only.
  const bedrockShim =
    recording && options.provider === 'bedrock'
      ? await startBedrockConverseShim({ upstream: options.upstream })
      : undefined;
  const startAimockOrStopShim = (
    startOptions: Parameters<typeof startAimock>[0],
  ) =>
    startAimock(startOptions).catch(async (error: unknown) => {
      await bedrockShim?.stop();
      throw error;
    });
  const aimock = await startAimockOrStopShim(
    recording
      ? {
          fixturePath,
          chunkSize: options.chunkSize,
          record: {
            providers: {
              [options.provider]: bedrockShim?.url ?? options.upstream,
            },
            fixturePath: RECORDED_FIXTURES_ROOT,
            secrets: options.secrets ?? collectSecrets(process.env),
          },
        }
      : {
          fixturePath,
          chunkSize: options.chunkSize,
          strict: true,
          ignoreRecordedTimings: true,
          strictMissMessage:
            `No recorded fixture matched for test "${slug}" ` +
            `(provider ${options.provider}) in ${fixturePath}. ` +
            'Record it with AIMOCK_RECORD=1.',
        },
  );

  const guardedAimock: AimockHandle = recording
    ? {
        ...aimock,
        async stop() {
          try {
            await aimock.stop();
          } finally {
            await bedrockShim?.stop();
          }
          rejectEmptyRecording(fixturePath, slug, options.provider);
        },
      }
    : aimock;

  return {
    aimock: guardedAimock,
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
