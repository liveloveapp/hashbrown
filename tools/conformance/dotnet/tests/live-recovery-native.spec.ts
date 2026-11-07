import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createDotnetProbeDirectory } from '../harness/dotnet-probe-directory';

const execute = promisify(execFile);

test('recovery native wrapper forwards genuine content and validates cold input, usage, options and disposal', async () => {
  const directory = await createDotnetProbeDirectory(
    'hashbrown-recovery-native-',
  );
  const project = resolve(
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
  );
  const source = await readFile(
    resolve(
      'tools/conformance/dotnet/tests/fixtures/live-recovery-client.cs.txt',
    ),
    'utf8',
  );

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
      { timeout: 50_000 },
    );

    expect(result.stdout).toContain(
      'Release recovery native client controls passed.',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test('actual native HTTPS audit preserves entity bytes and Azure CLI semantics while rejecting wire and redirect violations', async () => {
  const { createServer } = await import('node:http');
  let requests = 0;
  let redirected = 0;
  const server = createServer((request, response) => {
    request.resume();
    requests++;
    if (request.url === '/redirected') redirected++;
    response.writeHead(302, { Location: '/redirected' }).end();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Actual redirect listener unavailable');
  const directory = await createDotnetProbeDirectory(
    'hashbrown-recovery-http-',
  );
  const project = resolve(
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
  );
  const source = await readFile(
    resolve(
      'tools/conformance/dotnet/tests/fixtures/live-recovery-http.cs.txt',
    ),
    'utf8',
  );

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
        env: {
          ...process.env,
          LIVE_REDIRECT_LOOPBACK: `http://127.0.0.1:${address.port}`,
        },
      },
    );

    expect(result.stdout).toContain(
      'Release recovery native HTTPS controls passed.',
    );
    expect(result.stdout + result.stderr).not.toContain('private-canary');
    expect(requests).toBe(1);
    expect(redirected).toBe(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test('cancellation during actual asynchronous native request-body serialization remains cancellation', async () => {
  const directory = await createDotnetProbeDirectory(
    'hashbrown-recovery-body-cancel-',
  );
  const project = resolve(
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
  );
  const source = await readFile(
    resolve(
      'tools/conformance/dotnet/tests/fixtures/live-recovery-http-body-cancel.cs.txt',
    ),
    'utf8',
  );

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
      { timeout: 50_000 },
    );

    expect(result.stdout).toContain(
      'Release recovery body-read cancellation preserved.',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
