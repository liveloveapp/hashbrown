import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type PackedPackage = {
  filename: string;
};

const workspaceRoot = resolve(__dirname, '../../..');
const coreDistPath = join(workspaceRoot, 'dist/packages/core');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const typescriptPath = join(workspaceRoot, 'node_modules/typescript/bin/tsc');

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
    encoding: 'utf8',
  });
}

function createPackageSandbox(): string {
  const sandboxPath = mkdtempSync(join(tmpdir(), 'hashbrown-core-package-'));
  const packResult = run(
    npmCommand,
    ['pack', coreDistPath, '--pack-destination', sandboxPath, '--json'],
    workspaceRoot,
  );

  if (packResult.status !== 0) {
    throw new Error(packResult.stderr || packResult.stdout);
  }

  const [packedPackage] = JSON.parse(packResult.stdout) as PackedPackage[];
  if (!packedPackage) {
    throw new Error('npm pack did not return a package');
  }

  const installResult = run(
    npmCommand,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      join(sandboxPath, packedPackage.filename),
    ],
    sandboxPath,
  );

  if (installResult.status !== 0) {
    throw new Error(installResult.stderr || installResult.stdout);
  }

  return sandboxPath;
}

test('packed Core package includes generated chunks and supports ESM and CJS', () => {
  const sandboxPath = createPackageSandbox();

  try {
    const installedCorePath = join(
      sandboxPath,
      'node_modules/@hashbrownai/core',
    );
    const generatedIndexFiles = readdirSync(coreDistPath).filter((file) =>
      file.startsWith('index'),
    );
    const publicApiDeclarations = readFileSync(
      join(coreDistPath, 'src/public_api.d.ts'),
      'utf8',
    );
    const frameDeclarationsExist = existsSync(
      join(coreDistPath, 'src/frames/index.d.ts'),
    );

    writeFileSync(
      join(sandboxPath, 'consumer.ts'),
      `
        import {
          type ChatRuntime,
          type Chat,
          createChatRuntime,
          type Transport,
          type TransportRequest,
          type TransportResponse,
        } from '@hashbrownai/core';
        // @ts-expect-error The legacy runtime factory is no longer public.
        import { fryHashbrown } from '@hashbrownai/core';
        // @ts-expect-error The branded runtime type has been replaced by ChatRuntime.
        import type { Hashbrown } from '@hashbrownai/core';
        // @ts-expect-error Legacy frame encoding is no longer public.
        import { encodeFrame, type Frame } from '@hashbrownai/core';

        const input: TransportRequest['input'] = {
          threadId: 'thread-1',
          runId: 'run-1',
          messages: [],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        };
        const request: TransportRequest = {
          input,
          signal: new AbortController().signal,
          attempt: 1,
          maxAttempts: 1,
          requestId: 'request-1',
        };
        const events = (async function* (): AsyncGenerator<never> {})();
        const response: TransportResponse = { events };
        const transport: Transport = {
          name: 'consumer',
          async send(nextRequest) {
            void nextRequest;
            return response;
          },
        };
        const runtime: ChatRuntime<string, Chat.AnyTool> = createChatRuntime({
          system: 'test',
          transport,
        });
        const teardown = runtime.start();
        const frame: Frame = { type: 'generation-start' };
        const encoded = encodeFrame(frame);

        // @ts-expect-error Transport requests require AG-UI input.
        const missingInput: TransportRequest = {
          signal: request.signal,
          attempt: request.attempt,
          maxAttempts: request.maxAttempts,
          requestId: request.requestId,
        };
        // @ts-expect-error Transport responses require AG-UI events.
        const missingEvents: TransportResponse = {};
        // @ts-expect-error Completion parameters are not transport input.
        request.params;
        // @ts-expect-error Byte streams are not transport responses.
        response.stream;
        // @ts-expect-error Frame generators are not transport responses.
        response.frames;
        // @ts-expect-error Thread-loading capability is not part of Transport.
        transport.supportsLegacyThreadLoading;
        // @ts-expect-error The legacy lifecycle method has been replaced by start().
        runtime.sizzle();
        // @ts-expect-error Direct core endpoint configuration belongs to HttpTransport.
        createChatRuntime({ system: 'test', apiUrl: '/alternate-run' });
        // @ts-expect-error Direct core middleware belongs to HttpTransport.
        runtime.updateOptions({ middleware: [] });
        // @ts-expect-error Provider structured-output modes are no longer public.
        type RemovedStructuredOutputOptions = Chat.Api.StructuredOutputOptions;
        // @ts-expect-error Provider structured-output mode names are no longer public.
        type RemovedStructuredOutputMode = Chat.Api.StructuredOutputMode;
        // @ts-expect-error Provider response-format modes are no longer public.
        type RemovedResponseFormatMode = Chat.Api.ResponseFormatMode;
        // @ts-expect-error Legacy completion parameters are no longer public.
        type RemovedCompletionCreateParams = Chat.Api.CompletionCreateParams;

        void [encoded, missingInput, missingEvents, teardown];
        void fryHashbrown;
        void (null as unknown as Hashbrown<string, Chat.AnyTool>);
        void (null as unknown as RemovedStructuredOutputOptions);
        void (null as unknown as RemovedStructuredOutputMode);
        void (null as unknown as RemovedResponseFormatMode);
        void (null as unknown as RemovedCompletionCreateParams);
      `,
    );
    const compileResult = run(
      process.execPath,
      [
        typescriptPath,
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'Node16',
        '--moduleResolution',
        'Node16',
        '--lib',
        'ES2022,DOM',
        'consumer.ts',
      ],
      sandboxPath,
    );
    const result = run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          import { createRequire } from 'node:module';
          import { dirname, join } from 'node:path';
          import { pathToFileURL } from 'node:url';

          const require = createRequire(import.meta.url);
          const packageJsonPath = require.resolve(
            '@hashbrownai/core/package.json',
          );
          const packageJson = require(packageJsonPath);
          const agUiCoreVersion = packageJson.dependencies?.['@ag-ui/core'];
          const agUiClientVersion = packageJson.dependencies?.['@ag-ui/client'];
          const jsonStreamVersion =
            packageJson.dependencies?.['@cacheplane/json-stream'];
          if (
            agUiCoreVersion !== '0.0.59' ||
            agUiClientVersion !== agUiCoreVersion ||
            jsonStreamVersion !== '0.1.0' ||
            packageJson.dependencies?.['@cacheplane/partial-json'] !== undefined
          ) {
            throw new Error(
              'Core must declare exact AG-UI and json-stream dependencies without partial-json',
            );
          }
          const cjs = require('@hashbrownai/core');
          const cjsJsonStream = require('@cacheplane/json-stream');
          const esm = await import(
            pathToFileURL(join(dirname(packageJsonPath), packageJson.module))
          );
          const esmJsonStream = await import('@cacheplane/json-stream');

          let partialJsonPath;
          try {
            partialJsonPath = require.resolve('@cacheplane/partial-json');
          } catch {}
          if (partialJsonPath !== undefined) {
            throw new Error('Core installed partial-json directly');
          }

          for (const [format, core, jsonStream] of [
            ['CJS', cjs, cjsJsonStream],
            ['ESM', esm, esmJsonStream],
          ]) {
            if (
              'framesToLengthPrefixedStream' in core ||
              'encodeFrame' in core ||
              'decodeFrames' in core
            ) {
              throw new Error(
                \`\${format} exposes a legacy frame API\`,
              );
            }

            const legacyExports = [
              'createParserState',
              'finalizeJsonParse',
              'getResolvedValue',
              'parseChunk',
            ].filter((name) => name in core);
            const parsed = jsonStream.finish(
              jsonStream.push(jsonStream.create(), '{"value":2}'),
            );
            const schema = core.s.object('result', {
              value: core.s.number('value'),
            });
            const output = core.s.fromJsonAst(schema, parsed);

            if (
              legacyExports.length > 0 ||
              output.result.state !== 'match' ||
              output.result.value.value !== 2
            ) {
              throw new Error(
                \`\${format} parser boundary returned \${JSON.stringify({
                  legacyExports,
                  output,
                })}\`,
              );
            }
          }
        `,
      ],
      sandboxPath,
    );

    expect(
      generatedIndexFiles.filter(
        (file) => !existsSync(join(installedCorePath, file)),
      ),
    ).toEqual([]);
    expect(publicApiDeclarations).not.toContain("export * from './frames';");
    expect(frameDeclarationsExist).toBe(false);
    expect({
      status: compileResult.status,
      signal: compileResult.signal,
      stderr: compileResult.stderr,
      stdout: compileResult.stdout,
    }).toEqual({
      status: 0,
      signal: null,
      stderr: '',
      stdout: '',
    });
    expect({
      status: result.status,
      signal: result.signal,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      signal: null,
      stderr: '',
    });
  } finally {
    rmSync(sandboxPath, { recursive: true, force: true });
  }
});
