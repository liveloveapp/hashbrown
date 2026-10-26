import { postRun, runInput, withDotnetFixture } from '../harness/http-fixture';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

async function runProbe(fixture: string, marker: string) {
  const directory = await mkdtemp(join(tmpdir(), 'hashbrown-authentication-'));
  const project = resolve(
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
  );
  const source = await readFile(
    resolve(`tools/conformance/dotnet/tests/fixtures/${fixture}.cs.txt`),
    'utf8',
  );
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    request.resume();
    const responses = request.url?.includes('/responses');
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify(
        responses
          ? {
              id: 'resp_fixture',
              object: 'response',
              created_at: 1720000000,
              model: 'deployment',
              status: 'completed',
              output: [
                {
                  type: 'message',
                  id: 'msg_fixture',
                  role: 'assistant',
                  status: 'completed',
                  content: [
                    { type: 'output_text', text: 'ok', annotations: [] },
                  ],
                },
              ],
              usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
            }
          : {
              id: 'chat_fixture',
              object: 'chat.completion',
              created: 1720000000,
              model: 'deployment',
              choices: [
                {
                  index: 0,
                  finish_reason: 'stop',
                  message: { role: 'assistant', content: 'ok' },
                },
              ],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
              },
            },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const loopback = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  try {
    await writeFile(
      join(directory, 'Probe.csproj'),
      `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><ProjectReference Include="${project}" /></ItemGroup></Project>`,
    );
    await writeFile(join(directory, 'Program.cs'), source);

    const result = await execute(
      process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
      [
        'run',
        '--project',
        join(directory, 'Probe.csproj'),
        '--verbosity',
        'quiet',
      ],
      {
        timeout: 50_000,
        env: { ...process.env, AUTH_PROBE_LOOPBACK: loopback },
      },
    );

    expect(result.stdout).toContain(marker);
    expect(result.stdout + result.stderr).not.toMatch(
      /fake-token-|fixture-only-key|must-never-fall-back/,
    );
    expect(requests).toBe(fixture.endsWith('-native') ? 8 : 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
}

test('trusted native authentication validates configuration and selects credentials without network access', async () => {
  await runProbe(
    'provider-authentication',
    'Native authentication configuration passed.',
  );
}, 60_000);

test('native SDK requests bind identity scopes, renew credentials, and fail without fallback', async () => {
  await runProbe(
    'provider-authentication-native',
    'Native authentication requests passed.',
  );
}, 60_000);

for (const api of ['responses', 'chat-completions']) {
  test(`browser forwarding cannot select identity, scope, endpoint or deployment for ${api}`, async () => {
    await withDotnetFixture(
      'azure',
      async (fixture) => {
        const result = await postRun(fixture, {
          ...runInput(),
          forwardedProps: {
            AzureAuthentication: 'azure-cli',
            ManagedIdentityClientId: 'browser-user',
            ModelEndpoint: 'https://browser.invalid/',
            Model: 'browser-model',
            Provider: 'openai',
            Scope: 'https://browser.invalid/.default',
            hashbrown: {
              azureAuthentication: 'managed-identity',
              managedIdentityClientId: 'browser-user',
              scope: 'https://browser.invalid/.default',
            },
          },
        });

        expect(result.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
        expect(fixture.requests).toHaveLength(1);
        expect(fixture.requests[0].body.model).toBe('fixture-azure-deployment');
        expect(fixture.requests[0].path).toMatch(
          api === 'responses'
            ? /^\/openai\/v1\/responses$/
            : /^\/openai\/deployments\/fixture-azure-deployment\/chat\/completions/,
        );
      },
      '',
      undefined,
      { ModelApi: api },
    );
  });
}
