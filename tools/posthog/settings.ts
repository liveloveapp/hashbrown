/**
 * Project-level PostHog settings the website depends on. `--plan` reports
 * drift; `--apply` patches only the drifted keys. Autocapture must stay on at
 * the project level: posthog-js's `autocapture: true` is ignored when the
 * project opts out, and bounce rate counts autocapture events.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPosthogClient } from './client.ts';

/** The desired values, keyed by PostHog project field. */
export const DESIRED_PROJECT_SETTINGS: Readonly<Record<string, unknown>> = {
  autocapture_opt_out: false,
  anonymize_ips: true,
};

/** One drifted setting. */
export interface SettingChange {
  key: string;
  current: unknown;
  desired: unknown;
}

/** The read/write access the settings need; faked in tests. */
export interface SettingsClient {
  get(path: string): Promise<unknown>;
  patch(path: string, body: unknown): Promise<unknown>;
}

/** The project resource, relative to the client's project base path. */
const PROJECT_PATH = '/';

/**
 * Compares the project's settings with {@link DESIRED_PROJECT_SETTINGS}.
 *
 * @param client - Read access to the project.
 * @returns The drifted settings.
 */
export async function planSettings(
  client: SettingsClient,
): Promise<SettingChange[]> {
  const project = (await client.get(PROJECT_PATH)) as Record<
    string,
    unknown
  > | null;
  if (typeof project !== 'object' || project === null)
    throw new Error('PostHog project response is not an object');
  return Object.entries(DESIRED_PROJECT_SETTINGS)
    .filter(([key, desired]) => project[key] !== desired)
    .map(([key, desired]) => ({ key, current: project[key], desired }));
}

/**
 * Patches the drifted settings, if any, in one request.
 *
 * @param client - Read/write access to the project.
 * @returns The settings that were changed.
 */
export async function applySettings(
  client: SettingsClient,
): Promise<SettingChange[]> {
  const changes = await planSettings(client);
  if (changes.length > 0) {
    await client.patch(
      PROJECT_PATH,
      Object.fromEntries(changes.map((change) => [change.key, change.desired])),
    );
  }
  return changes;
}

async function main(args: readonly string[]): Promise<number> {
  const apply = args.includes('--apply');
  if (args.length !== 1 || (!apply && !args.includes('--plan'))) {
    console.error('Usage: settings.ts (--plan | --apply)');
    return 1;
  }
  try {
    const client = createPosthogClient();
    const changes = apply
      ? await applySettings(client)
      : await planSettings(client);
    if (changes.length === 0) console.log('Project settings match.');
    for (const change of changes) {
      console.log(
        `${apply ? '[applied]' : '[drift]'}  ${change.key}: ${JSON.stringify(change.current)} -> ${JSON.stringify(change.desired)}`,
      );
    }
    return 0;
  } catch (err) {
    console.error(
      `Settings ${apply ? 'apply' : 'plan'} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

const entry = process.argv[1];
if (entry && pathToFileURL(resolve(entry)).href === import.meta.url) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
