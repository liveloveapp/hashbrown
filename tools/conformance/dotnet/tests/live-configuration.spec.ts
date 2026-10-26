import {
  loadLiveConfiguration,
  publicChildEnvironment,
} from '../harness/live-configuration';

const text =
  'OPENAI_API_KEY=openai-canary\nAZURE_API_KEY=azure-canary\nAZURE_ENDPOINT=https://example.openai.azure.com\nAZURE_MODEL=gpt-4.1-mini\nUNTRUSTED=ignored';

const load = (projects: readonly string[], value = text) =>
  loadLiveConfiguration({
    optIn: '1',
    credentialFile: '/fixture.env',
    projects,
    readCredentialFile: async () => value,
  });

test('rejects absent opt-in before reading a credential file', async () => {
  let reads = 0;

  const result = loadLiveConfiguration({
    optIn: undefined,
    credentialFile: '/fixture.env',
    projects: ['react-openai-key'],
    readCredentialFile: async () => {
      reads++;
      return text;
    },
  });

  await expect(result).rejects.toThrow('LIVE_OPT_IN_REQUIRED');
  expect(reads).toBe(0);
});

test('requires explicit projects and rejects unknown and duplicate selections before reading', async () => {
  for (const projects of [
    [],
    ['unknown'],
    ['react-openai-key', 'react-openai-key'],
  ]) {
    let reads = 0;

    const result = loadLiveConfiguration({
      optIn: '1',
      credentialFile: '/fixture.env',
      projects,
      readCredentialFile: async () => {
        reads++;
        return text;
      },
    });

    await expect(result).rejects.toThrow('LIVE_PROJECT_INVALID');
    expect(reads).toBe(0);
  }
});

test('keeps selected keys private and exposes only minimal selected native environments', async () => {
  const configuration = await load([
    'react-openai-key',
    'angular-azure-key',
    'react-azure-cli',
  ]);
  const parent = {
    PATH: '/bin',
    HOME: '/home/test',
    AZURE_CONFIG_DIR: '/profile',
    DOTNET_ROOT: '/dotnet',
    OPENAI_API_KEY: 'inherited-canary',
    NODE_OPTIONS: 'untrusted',
    IDENTITY_ENDPOINT: 'untrusted',
  };

  const openai = configuration.providerEnvironment('react-openai-key', parent);
  const azure = configuration.providerEnvironment('angular-azure-key', parent);
  const cli = configuration.providerEnvironment('react-azure-cli', parent);

  expect(JSON.stringify(configuration)).not.toMatch(/canary/);
  expect(openai).toEqual({
    PATH: '/bin',
    HOME: '/home/test',
    DOTNET_ROOT: '/dotnet',
    Provider: 'openai',
    ModelApi: 'responses',
    Model: 'gpt-4.1-mini',
    ModelEndpoint: 'https://api.openai.com/v1',
    ApiKey: 'openai-canary',
    AzureAuthentication: 'api-key',
  });
  expect(azure.ApiKey).toBe('azure-canary');
  expect(cli).toEqual({
    PATH: '/bin',
    HOME: '/home/test',
    DOTNET_ROOT: '/dotnet',
    AZURE_CONFIG_DIR: '/profile',
    Provider: 'azure',
    ModelApi: 'responses',
    Model: 'gpt-4.1-mini',
    ModelEndpoint: 'https://example.openai.azure.com/',
    AzureAuthentication: 'azure-cli',
  });
  expect(() =>
    configuration.providerEnvironment('angular-openai-key', parent),
  ).toThrow('LIVE_PROJECT_NOT_SELECTED');
  expect(Object.isFrozen(configuration)).toBe(true);
});

test('CLI requires endpoint and model but never a key or inherited credential fallback', async () => {
  const configuration = await load(
    ['react-azure-cli'],
    'AZURE_ENDPOINT=https://example.openai.azure.com\nAZURE_MODEL=gpt-4.1-mini',
  );

  const environment = configuration.providerEnvironment('react-azure-cli', {
    AZURE_API_KEY: 'canary',
    ApiKey: 'canary',
    AZURE_CLIENT_SECRET: 'canary',
  });

  expect(environment).not.toHaveProperty('ApiKey');
  expect(Object.values(environment)).not.toContain('canary');
});

test('validates only selected credentials and fails closed on file errors', async () => {
  const configuration = await load(
    ['react-openai-key'],
    'OPENAI_API_KEY=canary',
  );

  expect(configuration.projects).toHaveLength(1);
  await expect(load(['react-openai-key'], '')).rejects.toThrow(
    'LIVE_KEY_REQUIRED',
  );
  await expect(
    load(['react-azure-key'], 'AZURE_ENDPOINT=https://example.com'),
  ).rejects.toThrow('LIVE_KEY_REQUIRED');
  await expect(
    loadLiveConfiguration({
      optIn: '1',
      credentialFile: '/fixture.env',
      projects: ['react-openai-key'],
      readCredentialFile: async () => {
        throw new Error('raw-secret-canary');
      },
    }),
  ).rejects.toThrow(/^LIVE_CREDENTIAL_FILE_FAILED$/);
});

test('rejects unsupported endpoint structures and model selections without exposing raw values', async () => {
  for (const endpoint of [
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com?key=canary',
    'https://example.com/#canary',
    'invalid-canary',
  ]) {
    const result = load(
      ['react-azure-cli'],
      `AZURE_ENDPOINT=${JSON.stringify(endpoint)}\nAZURE_MODEL=gpt-4.1-mini`,
    );

    await expect(result).rejects.toThrow(/^LIVE_ENDPOINT_INVALID$/);
  }
  await expect(
    load(
      ['react-openai-key'],
      'OPENAI_API_KEY=canary\nOPENAI_MODEL=secret-canary',
    ),
  ).resolves.toBeDefined();
  await expect(
    load(
      ['react-azure-cli'],
      'AZURE_ENDPOINT=https://example.com\nAZURE_MODEL=secret-canary',
    ),
  ).rejects.toThrow(/^LIVE_MODEL_INVALID$/);
});

test('public build and browser child environments exclude all provider and identity data', () => {
  const parent = {
    PATH: '/bin',
    HOME: '/home',
    TMPDIR: '/tmp',
    AZURE_CONFIG_DIR: '/profile',
    DOTNET_ROOT: '/dotnet',
    OPENAI_API_KEY: 'canary',
    AZURE_API_KEY: 'canary',
    ApiKey: 'canary',
    IDENTITY_HEADER: 'canary',
    NODE_OPTIONS: 'canary',
  };

  const result = publicChildEnvironment(parent);

  expect(result).toEqual({
    PATH: '/bin',
    HOME: '/home',
    TMPDIR: '/tmp',
    DOTNET_ROOT: '/dotnet',
  });
  expect(Object.isFrozen(result)).toBe(true);
});
