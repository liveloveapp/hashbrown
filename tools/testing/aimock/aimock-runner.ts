import { LLMock } from '@copilotkit/aimock';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Running aimock server handle for deterministic provider e2e tests.
 */
export interface AimockHandle {
  /** Port the mock server is listening on. */
  readonly port: number;
  /** Raw aimock server URL without a provider-specific path suffix. */
  readonly url: string;
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
 * Options for starting deterministic aimock replay.
 */
export interface AimockStartOptions {
  /** Path to one fixture file or a directory of `.json` fixture files. */
  readonly fixturePath: string;
  /** Optional chunk size passed through to aimock. */
  readonly chunkSize?: number;
}

type FixtureFileEntry = Record<string, unknown>;

function loadFixtureEntries(fixturePath: string): FixtureFileEntry[] {
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

/**
 * Start aimock in replay mode with the supplied fixture file or directory.
 */
export async function startAimock(
  options: AimockStartOptions,
): Promise<AimockHandle> {
  const entries = loadFixtureEntries(options.fixturePath);
  const mock = new LLMock({
    port: 0,
    chunkSize: options.chunkSize ?? 4096,
  });

  if (entries.length > 0) {
    mock.addFixturesFromJSON(entries as never);
  }

  await mock.start();

  let stopped = false;
  const url = mock.url;

  return {
    port: mock.port,
    url,
    openAiBaseUrl: `${url}/v1`,
    anthropicBaseUrl: url,
    ollamaHost: url,
    async stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      await mock.stop();
    },
  };
}
