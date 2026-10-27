import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

/** Trusted project metadata, containing no credential material. */
export interface LiveProject {
  readonly name: string;
  readonly framework: 'react' | 'angular';
  readonly provider: 'openai' | 'azure';
  readonly auth: 'api-key' | 'azure-cli';
}

/** The complete supported live matrix; managed identity remains separately qualified. */
export const LIVE_PROJECTS: readonly LiveProject[] = Object.freeze(
  (['react', 'angular'] as const).flatMap((framework) =>
    (['openai-key', 'azure-key', 'azure-cli'] as const).map((selection) =>
      Object.freeze({
        name: `${framework}-${selection}`,
        framework,
        provider:
          selection === 'openai-key' ? ('openai' as const) : ('azure' as const),
        auth:
          selection === 'azure-cli'
            ? ('azure-cli' as const)
            : ('api-key' as const),
      }),
    ),
  ),
);

/** Explicit execution inputs; the reader is called only after opt-in and selection validation. */
export interface LiveConfigurationInput {
  readonly optIn: string | undefined;
  readonly credentialFile: string;
  readonly projects: readonly string[];
  readonly readCredentialFile?: (path: string) => Promise<string>;
}

/** Safe configuration metadata with a closure-owned selected native environment factory. */
export interface LiveConfiguration {
  readonly projects: readonly LiveProject[];
  readonly model: 'gpt-4.1-mini';
  readonly providerEnvironment: (
    project: string,
    parent: Readonly<Record<string, string | undefined>>,
  ) => Readonly<Record<string, string>>;
}

const publicVariables = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'SystemRoot',
  'WINDIR',
  'TMP',
  'TEMP',
  'TMPDIR',
  'DOTNET_ROOT',
  'DOTNET_HOST_PATH',
  'DOTNET_CLI_HOME',
  'DOTNET_MULTILEVEL_LOOKUP',
] as const;

/** Copies only process execution context, excluding all provider and identity secrets. */
export function publicChildEnvironment(
  parent: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      publicVariables.flatMap((key) =>
        parent[key] === undefined ? [] : [[key, parent[key]]],
      ),
    ),
  );
}

/** Loads authorized credentials only during explicit execution and retains keys in a closure. */
export async function loadLiveConfiguration(
  input: LiveConfigurationInput,
): Promise<LiveConfiguration> {
  if (input.optIn !== '1') throw new Error('LIVE_OPT_IN_REQUIRED');
  if (
    !input.projects.length ||
    new Set(input.projects).size !== input.projects.length ||
    input.projects.some(
      (name) => !LIVE_PROJECTS.some((project) => project.name === name),
    )
  )
    throw new Error('LIVE_PROJECT_INVALID');
  if (!input.credentialFile.trim())
    throw new Error('LIVE_CREDENTIAL_FILE_REQUIRED');
  const projects = Object.freeze(
    input.projects.map((name) => {
      const project = LIVE_PROJECTS.find((entry) => entry.name === name);
      if (!project) throw new Error('LIVE_PROJECT_INVALID');
      return project;
    }),
  );
  let parsed: Readonly<Record<string, string | undefined>>;
  try {
    parsed = parseEnv(
      await (input.readCredentialFile ?? ((path) => readFile(path, 'utf8')))(
        input.credentialFile,
      ),
    );
  } catch {
    throw new Error('LIVE_CREDENTIAL_FILE_FAILED');
  }
  const openaiKey = parsed['OPENAI_API_KEY'];
  const azureKey = parsed['AZURE_API_KEY'];
  if (
    (projects.some((project) => project.provider === 'openai') &&
      !openaiKey?.trim()) ||
    (projects.some(
      (project) => project.provider === 'azure' && project.auth === 'api-key',
    ) &&
      !azureKey?.trim())
  )
    throw new Error('LIVE_KEY_REQUIRED');
  let azureEndpoint = '';
  if (projects.some((project) => project.provider === 'azure')) {
    try {
      const endpoint = new URL(parsed['AZURE_ENDPOINT'] ?? '');
      if (
        endpoint.protocol !== 'https:' ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
      )
        throw new Error();
      azureEndpoint = endpoint.href;
    } catch {
      throw new Error('LIVE_ENDPOINT_INVALID');
    }
    if (
      parsed['AZURE_MODEL'] !== undefined &&
      parsed['AZURE_MODEL'] !== 'gpt-4.1-mini'
    )
      throw new Error('LIVE_MODEL_INVALID');
  }
  return Object.freeze({
    projects,
    model: 'gpt-4.1-mini' as const,
    providerEnvironment: (
      name: string,
      parent: Readonly<Record<string, string | undefined>>,
    ) => {
      const project = projects.find((entry) => entry.name === name);
      if (!project) throw new Error('LIVE_PROJECT_NOT_SELECTED');
      const key = project.provider === 'openai' ? openaiKey : azureKey;
      if (project.auth === 'api-key' && !key?.trim())
        throw new Error('LIVE_KEY_REQUIRED');
      return Object.freeze({
        ...publicChildEnvironment(parent),
        ...(project.auth === 'azure-cli' &&
        parent['AZURE_CONFIG_DIR'] !== undefined
          ? { AZURE_CONFIG_DIR: parent['AZURE_CONFIG_DIR'] }
          : {}),
        Provider: project.provider,
        ModelApi: 'responses',
        Model: 'gpt-4.1-mini',
        ModelEndpoint:
          project.provider === 'openai'
            ? 'https://api.openai.com/v1'
            : azureEndpoint,
        AzureAuthentication: project.auth,
        ...(project.auth === 'api-key' && key !== undefined
          ? { ApiKey: key }
          : {}),
      });
    },
  });
}
