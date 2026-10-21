import { LLMock } from '@copilotkit/aimock';
import { AGUIMock } from '@copilotkit/aimock/agui';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Running aimock server handle for deterministic provider e2e tests.
 */
export interface AimockHandle {
  /** Port the mock server is listening on. */
  readonly port: number;
  /** Raw aimock server URL without a provider-specific path suffix. */
  readonly url: string;
  /** AG-UI run endpoint mounted on the shared aimock server. */
  readonly aguiRunUrl: string;
  /** AG-UI mock used to register deterministic run fixtures. */
  readonly aguiMock: AGUIMock;
  /** OpenAI-compatible base URL including `/v1`. */
  readonly openAiBaseUrl: string;
  /** Anthropic-compatible base URL without `/v1`; the SDK appends it. */
  readonly anthropicBaseUrl: string;
  /** Ollama-compatible host URL without `/v1`. */
  readonly ollamaHost: string;
  /** Stop the mock server. Safe to call more than once. */
  stop(): Promise<void>;
}

/**
 * Provider keys aimock records under. Azure OpenAI records as `openai`.
 */
export type AimockProvider =
  'openai' | 'anthropic' | 'gemini' | 'bedrock' | 'ollama';

/**
 * Options that switch aimock into record mode, proxying unmatched requests
 * to the real provider and writing what comes back as fixtures.
 */
export interface AimockRecordOptions {
  /** Upstream base URL per provider key. */
  readonly providers: Partial<Record<AimockProvider, string>>;
  /** Directory aimock writes recordings into (the `recorded` root). */
  readonly fixturePath: string;
  /** Values replaced with `[REDACTED]` in every file written during recording. */
  readonly secrets: readonly string[];
}

/**
 * Options for starting aimock in replay or record mode.
 */
export interface AimockStartOptions {
  /**
   * Path to one fixture file or a directory of `.json` fixture files. A path
   * that does not exist yet (a test that was never recorded) loads nothing.
   */
  readonly fixturePath: string;
  /** Optional chunk size passed through to aimock. */
  readonly chunkSize?: number;
  /**
   * Return 503 for any request no fixture matches. Ignored while recording,
   * because aimock checks strict mode before it proxies a miss upstream.
   */
  readonly strict?: boolean;
  /**
   * Message served with the strict-mode 503, so a missing fixture names what
   * was expected. Only used when `strict` applies.
   */
  readonly strictMissMessage?: string;
  /** Record unmatched requests from the real provider instead of failing. */
  readonly record?: AimockRecordOptions;
}

/** Placeholder written over every secret value found in a recording. */
const REDACTED = '[REDACTED]';

/** Generous timeouts: reasoning models can pause for a long time mid-stream. */
const RECORD_TIMEOUT_MS = 180_000;

type FixtureFileEntry = Record<string, unknown>;

function loadFixtureEntries(fixturePath: string): FixtureFileEntry[] {
  if (!existsSync(fixturePath)) {
    return [];
  }

  const stats = statSync(fixturePath);
  const entries: FixtureFileEntry[] = [];
  const readFixtureFile = (filePath: string) => {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as { fixtures?: FixtureFileEntry[] };
    for (const fixture of parsed.fixtures ?? []) {
      entries.push(fixture);
    }
  };

  if (!stats.isDirectory()) {
    readFixtureFile(fixturePath);
    return entries;
  }

  for (const file of readdirSync(fixturePath)
    .filter((entry) => entry.endsWith('.json'))
    .sort()) {
    readFixtureFile(join(fixturePath, file));
  }

  return entries;
}

function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  });
}

// Each secret is matched raw and in its JSON-escaped form, as it appears in a
// recording. Longer forms go first so a secret that contains another is fully
// removed.
function redactSecrets(text: string, secrets: readonly string[]): string {
  const forms = secrets
    .filter((secret) => secret.length > 0)
    .flatMap((secret) => [secret, JSON.stringify(secret).slice(1, -1)]);
  return [...new Set(forms)]
    .sort((a, b) => b.length - a.length)
    .reduce((result, secret) => result.split(secret).join(REDACTED), text);
}

function scrubRecordings(dir: string, secrets: readonly string[]): void {
  for (const filePath of listJsonFiles(dir)) {
    const original = readFileSync(filePath, 'utf-8');
    const scrubbed = redactSecrets(original, secrets);
    if (scrubbed !== original) {
      writeFileSync(filePath, scrubbed);
    }
  }
}

/**
 * Start aimock with the supplied fixture file or directory.
 *
 * Replays fixtures by default. With `strict`, a request no fixture matches
 * gets a 503. With `record`, unmatched requests go to the real provider and
 * aimock writes the responses under `record.fixturePath`; `stop()` then
 * replaces every configured secret in the `.json` files there with
 * `[REDACTED]`.
 */
export async function startAimock(
  options: AimockStartOptions,
): Promise<AimockHandle> {
  const entries = loadFixtureEntries(options.fixturePath);
  const record = options.record;
  const strict = options.strict === true && record === undefined;
  const mock = new LLMock({
    port: 0,
    chunkSize: options.chunkSize ?? 4096,
    strict,
  });
  const aguiMock = new AGUIMock();
  mock.mount('/run', aguiMock);

  if (entries.length > 0) {
    mock.addFixturesFromJSON(entries as never);
  }

  if (strict && options.strictMissMessage !== undefined) {
    // Matched last, so it only answers what no fixture matched.
    mock.addFixture({
      match: { predicate: () => true },
      response: {
        error: {
          message: options.strictMissMessage,
          type: 'aimock_missing_fixture',
        },
        status: 503,
      },
    });
  }

  if (record) {
    mock.enableRecording({
      providers: { ...record.providers },
      fixturePath: record.fixturePath,
      upstreamTimeoutMs: RECORD_TIMEOUT_MS,
      bodyTimeoutMs: RECORD_TIMEOUT_MS,
    });
  }

  await mock.start();

  let stopped = false;
  let stopPromise: Promise<void> | undefined;
  const url = mock.url;

  return {
    port: mock.port,
    url,
    aguiRunUrl: `${url}/run`,
    aguiMock,
    openAiBaseUrl: `${url}/v1`,
    anthropicBaseUrl: url,
    ollamaHost: url,
    async stop() {
      if (stopped) {
        return;
      }
      if (stopPromise) {
        await stopPromise;
        return;
      }

      stopPromise = mock.stop();
      try {
        await stopPromise;
        if (record) {
          scrubRecordings(record.fixturePath, record.secrets);
        }
        stopped = true;
      } finally {
        stopPromise = undefined;
      }
    },
  };
}
