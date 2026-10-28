import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

type PackageJson = {
  dependencies?: Record<string, string>;
  main?: string;
  module?: string;
  types?: string;
  exports?: {
    '.'?: {
      types?: string;
      import?: string;
      require?: string;
    };
  };
};

const workspaceRoot = resolve(__dirname, '../../..');
const reactDistPath = join(workspaceRoot, 'dist/packages/react');
const coreDistPath = join(workspaceRoot, 'dist/packages/core');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const typescriptPath = join(workspaceRoot, 'node_modules/typescript/bin/tsc');
const childProcessTimeoutMs = 90_000;

function readReactPackageJson(): PackageJson {
  return JSON.parse(
    readFileSync(join(reactDistPath, 'package.json'), 'utf8'),
  ) as PackageJson;
}

function assertProcessSucceeded(
  label: string,
  command: string,
  args: string[],
  result: SpawnSyncReturns<string>,
): void {
  if (!result.error && !result.signal && result.status === 0) {
    return;
  }

  const processError = result.error as NodeJS.ErrnoException | undefined;
  const failureDetails = [
    processError
      ? `${processError.code ?? processError.name}: ${processError.message}`
      : undefined,
    result.signal ? `signal ${result.signal}` : undefined,
    result.status !== null ? `exit status ${result.status}` : undefined,
  ].filter(Boolean);
  throw new Error(
    `${label} failed (${failureDetails.join(', ')})\n` +
      `Command: ${command} ${args.join(' ')}\n` +
      `stdout:\n${result.stdout || '<empty>'}\n` +
      `stderr:\n${result.stderr || '<empty>'}`,
  );
}

function runNodePackageCheck(script: string, sandboxPath: string) {
  const args = ['--input-type=module', '--eval', script];
  const result = spawnSync(process.execPath, args, {
    cwd: sandboxPath,
    env: {
      ...process.env,
      NODE_PATH: join(sandboxPath, 'node_modules'),
    },
    encoding: 'utf8',
    timeout: childProcessTimeoutMs,
  });
  assertProcessSucceeded('Consumer Node check', process.execPath, args, result);

  return result;
}

function runNpm(args: string[], cwd: string): string {
  const result = spawnSync(npmCommand, args, {
    cwd,
    encoding: 'utf8',
    timeout: childProcessTimeoutMs,
  });
  assertProcessSucceeded('npm command', npmCommand, args, result);

  return result.stdout;
}

function packPackage(packagePath: string, packPath: string): string {
  const output = runNpm(
    ['pack', packagePath, '--json', '--pack-destination', packPath],
    workspaceRoot,
  );
  const packs = JSON.parse(output) as Array<{ filename?: string }>;
  const filename = packs[0]?.filename;
  if (!filename) {
    throw new Error(`npm pack did not report a filename for ${packagePath}`);
  }

  return join(packPath, filename);
}

function createPackageSandbox(): string {
  const sandboxPath = mkdtempSync(join(tmpdir(), 'hashbrown-react-package-'));
  try {
    const packPath = join(sandboxPath, 'packs');
    mkdirSync(packPath);
    writeFileSync(
      join(sandboxPath, 'package.json'),
      JSON.stringify({
        name: 'hashbrown-react-package-e2e',
        private: true,
        type: 'module',
      }),
    );
    const coreTarball = packPackage(coreDistPath, packPath);
    const reactTarball = packPackage(reactDistPath, packPath);
    runNpm(
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        coreTarball,
        reactTarball,
        'react@19.2.8',
        'react-dom@19.2.8',
        '@types/react@19.2.9',
      ],
      sandboxPath,
    );

    return sandboxPath;
  } catch (error) {
    rmSync(sandboxPath, { recursive: true, force: true });
    throw error;
  }
}

test('published React package metadata exposes ESM and CJS entrypoints', () => {
  const packageJson = readReactPackageJson();
  const esmBundle = readFileSync(join(reactDistPath, 'index.mjs'), 'utf8');
  const cjsBundle = readFileSync(join(reactDistPath, 'index.cjs'), 'utf8');

  expect(packageJson.types).toBe('./index.d.ts');
  expect(packageJson.module).toBe('./index.mjs');
  expect(packageJson.main).toBe('./index.cjs');
  expect(packageJson.dependencies?.['@cacheplane/partial-json']).toBe('0.3.1');
  expect(packageJson.dependencies?.['@cacheplane/json-stream']).toBeUndefined();
  expect(packageJson.exports?.['.']).toEqual({
    types: './index.d.ts',
    import: './index.mjs',
    require: './index.cjs',
  });
  expect(existsSync(join(reactDistPath, 'index.d.ts'))).toBe(true);
  expect(existsSync(join(reactDistPath, 'index.mjs'))).toBe(true);
  expect(existsSync(join(reactDistPath, 'index.cjs'))).toBe(true);
  expect(esmBundle).toMatch(/from ['"]@cacheplane\/partial-json['"]/);
  expect(esmBundle).not.toContain('@cacheplane/json-stream');
  expect(cjsBundle).toMatch(/require\(['"]@cacheplane\/partial-json['"]\)/);
  expect(cjsBundle).not.toContain('@cacheplane/json-stream');
});

test('packed React and core packages install and load in a clean consumer', () => {
  const sandboxPath = createPackageSandbox();

  try {
    writeFileSync(
      join(sandboxPath, 'consumer.ts'),
      `
        import type {

          Turn,
          TurnAttribution,
          TurnSummary,
          TurnSummaryOptions,
          ServerToolCallLabelOverride,
          ServerToolCallLabelOverrides,
          ServerToolCallGroup,
          GroupedServerToolCall,
          GroupServerToolCallsOptions,
          SubagentRun,
          UiChatMessage,
          HashbrownProviderOptions,
          UiChatOptions,
          UiCompletionOptions,
          UseStructuredChatOptions,
          UseStructuredCompletionOptions,
        } from '@hashbrownai/react';
        import {

          groupTurns,
          getServerToolCallLabel,
          groupServerToolCalls,
          collectTurnSources,
          collectTurnAttributions,
          summarizeTurn,
          formatDuration,
          noFlashRemaining,
          NO_FLASH_MS,
          ELAPSED_TICK_MS,
          useChat,
          useCompletion,
          useStructuredChat,
          useStructuredCompletion,
          useUiChat,
          useUiCompletion,
        } from '@hashbrownai/react';
        import { s } from '@hashbrownai/core';

        declare const providerOptions: HashbrownProviderOptions;
        declare const structuredChatOptions: UseStructuredChatOptions<any, any>;
        declare const structuredCompletionOptions: UseStructuredCompletionOptions<any, any>;
        declare const uiChatOptions: UiChatOptions<any>;
        declare const uiCompletionOptions: UiCompletionOptions<any, any>;

        // @ts-expect-error Structured-output emulation is no longer configurable.
        providerOptions.emulateStructuredOutput;
        // @ts-expect-error Structured-output modes are owned by the server adapter.
        structuredChatOptions.structuredOutput;
        // @ts-expect-error Structured-output modes are owned by the server adapter.
        structuredCompletionOptions.structuredOutput;
        // @ts-expect-error Structured-output modes are owned by the server adapter.
        uiChatOptions.structuredOutput;
        // @ts-expect-error Structured-output modes are owned by the server adapter.
        uiCompletionOptions.structuredOutput;

        function verifySharedStateInference() {
          const schema = s.object('result', {
            answer: s.string('answer'),
          });
          const plainChat = useChat({ system: 'system', state: { count: 1 } });
          const structuredChat = useStructuredChat({
            system: 'system',
            schema,
            state: { count: 1 },
          });
          const completion = useCompletion({
            input: 'input',
            system: 'system',
            state: { count: 1 },
          });
          const structuredCompletion = useStructuredCompletion({
            input: 'input',
            system: 'system',
            schema,
            state: { count: 1 },
          });
          const uiChat = useUiChat({
            system: 'system',
            components: [],
            state: { count: 1 },
          });
          for (const result of [plainChat, structuredChat, uiChat]) {
            const records: readonly SubagentRun[] = result.subagents;
            // @ts-expect-error Native subagent records cannot be appended by consumers.
            records.push({ subagentRunId: 'child', status: 'unknown' });
            // @ts-expect-error Native lifecycle projections are readonly.
            result.subagents = result.subagents;
            if (records[0]) {
              // @ts-expect-error Native lifecycle records are readonly.
              records[0].status = 'running';
            }
            void records;
          }
          const uiCompletion = useUiCompletion({
            input: 'input',
            system: 'system',
            components: [],
            state: { count: 1 },
          });

          for (const result of [
            plainChat,
            structuredChat,
            completion,
            structuredCompletion,
            uiChat,
            uiCompletion,
          ]) {
            result.setState({ count: 2 });
            // @ts-expect-error Shared state preserves the inferred property type.
            result.setState({ count: 'invalid' });
          }
        }

        void verifySharedStateInference;

        function verifyNativeSubagentProvenance(message: UiChatMessage<never>) {
          if (message.role === 'assistant') {
            const owner: string | undefined = message.subagentRunId;
            for (const call of message.serverToolCalls ?? []) {
              const requester: string | undefined = call.subagentRunId;
              const executor: string | undefined = call.resultSubagentRunId;
              void [owner, requester, executor];
            }
          }
        }
        void verifyNativeSubagentProvenance;

        function verifyTurnHelpers(messages: readonly UiChatMessage<never>[]) {
          const turns: readonly Turn<UiChatMessage<never>>[] = groupTurns(messages);
          const override: ServerToolCallLabelOverride = { label: () => 'Looked up context' };
          const labels: ServerToolCallLabelOverrides = { lookup: override };
          const grouping: GroupServerToolCallsOptions = { labels, exclude: ['task'] };
          const options: TurnSummaryOptions = { status: 'working', labels };
          for (const turn of turns) {
            const summary: TurnSummary = summarizeTurn(turn, options);
            const attributions: readonly TurnAttribution[] = collectTurnAttributions(turn);
            const rows: readonly GroupedServerToolCall[] = groupServerToolCalls(
              turn.assistants.flatMap(answer => answer.serverToolCalls ?? []), grouping,
            );
            for (const row of rows) {
              if (row.kind === 'group') {
                const group: ServerToolCallGroup = row;
                void group;
              } else {
                getServerToolCallLabel(row, labels);
              }
            }
            collectTurnSources(turn);
            formatDuration(summary.durationMs);
            noFlashRemaining(undefined, NO_FLASH_MS + ELAPSED_TICK_MS);
            void attributions;
          }
        }
        void verifyTurnHelpers;

      `,
    );
    const compileArgs = [
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
    ];
    const compileResult = spawnSync(process.execPath, compileArgs, {
      cwd: sandboxPath,
      encoding: 'utf8',
      timeout: childProcessTimeoutMs,
    });
    assertProcessSucceeded(
      'Consumer TypeScript check',
      process.execPath,
      compileArgs,
      compileResult,
    );
    const result = runNodePackageCheck(
      `
        import { createRequire } from 'node:module';

        const require = createRequire(import.meta.url);
        const partialJsonPackage = require('@cacheplane/partial-json/package.json');
        const partialJsonRequire = createRequire(
          require.resolve('@cacheplane/partial-json/package.json'),
        );
        const jsonStreamPackage = partialJsonRequire(
          '@cacheplane/json-stream/package.json',
        );
        const cjs = require('@hashbrownai/react');
        const cjsCore = require('@hashbrownai/core');
        const esm = await import('@hashbrownai/react');
        const esmCore = await import('@hashbrownai/core');
        for (const core of [cjsCore, esmCore]) {
          const runtime = core.createChatRuntime({ system: 'consumer' });
          const initial = runtime.subagents();
          if (initial.length !== 0 || !Object.isFrozen(initial) || runtime.subagents() !== initial) {
            throw new Error('Packed runtime must expose the frozen native subagent selector');
          }
        }


        for (const [api, core] of [[cjs, cjsCore], [esm, esmCore]]) {
          for (const name of ['groupTurns', 'getServerToolCallLabel', 'groupServerToolCalls',
            'collectTurnSources', 'collectTurnAttributions', 'summarizeTurn',
            'formatDuration', 'noFlashRemaining']) {
            if (typeof api[name] !== 'function' || api[name] !== core[name]) throw new Error('Shared helper mismatch: ' + name);
          }
          const source = { id: 'source-1', kind: 'url', title: 'Original source' };
          const attribution = { provider: 'google', kind: 'search-suggestions',
            html: '<div>provider markup</div>', widgetToken: 'provider-token', mustRender: true };
          const calls = [1, 2].map(id => ({ toolCallId: 'call-' + id,
            name: 'lookup', status: 'complete', args: null, outcome: 'success', sources: [source] }));
          const turn = api.groupTurns([
            { id: 'user-1', role: 'user', content: 'Find context' },
            { id: 'answer-1', role: 'assistant', toolCalls: [], serverToolCalls: calls,
              sources: [source], attribution: [attribution] },
          ])[0];
          const rows = api.groupServerToolCalls(calls);
          const summary = api.summarizeTurn(turn, { startedAt: 100, settledAt: 2100 });
          const sources = api.collectTurnSources(turn);
          const records = api.collectTurnAttributions(turn);
          if (rows.length !== 1 || rows[0].kind !== 'group' || rows[0].calls.length !== 2 ||
              rows[0].calls[0] !== calls[0] || api.getServerToolCallLabel(calls[0]) !== 'Used lookup' ||
              summary.status !== 'complete' || summary.live || summary.toolCallCount !== 2 ||
              summary.sourceCount !== 1 || summary.durationMs !== 2000 ||
              sources.length !== 1 || sources[0] !== source || records.length !== 1 ||
              records[0].assistantMessageId !== 'answer-1' || records[0].attribution !== attribution ||
              api.formatDuration(summary.durationMs) !== '2s' ||
              api.noFlashRemaining(100, 200) !== 200 || api.NO_FLASH_MS !== 300 || api.ELAPSED_TICK_MS !== 1000) {
            throw new Error('Public turn helpers did not preserve display behavior');
          }
        }


        if (typeof cjsCore.HttpTransport !== 'function') {
          throw new Error('CJS core did not load the AG-UI transport dependency tree');
        }

        if (typeof esmCore.HttpTransport !== 'function') {
          throw new Error('ESM core did not load the AG-UI transport dependency tree');
        }

        if (typeof cjs.HashbrownProvider !== 'function') {
          throw new Error('CJS entrypoint did not expose HashbrownProvider');
        }

        if (typeof esm.HashbrownProvider !== 'function') {
          throw new Error('ESM entrypoint did not expose HashbrownProvider');
        }

        if (
          partialJsonPackage.version !== '0.3.1' ||
          !/^\\^0\\.1\\.\\d+$/.test(
            partialJsonPackage.dependencies?.['@cacheplane/json-stream'] ?? '',
          ) ||
          !/^0\\.1\\.\\d+$/.test(jsonStreamPackage.version)
        ) {
          throw new Error('React resolved incompatible Cacheplane packages');
        }
      `,
      sandboxPath,
    );

    const sharedStateDeclarations = [
      'use-chat.d.ts',
      'use-completion.d.ts',
      'use-structured-chat.d.ts',
      'use-structured-completion.d.ts',
      'use-structured-completion-with-message.d.ts',
      'use-ui-chat.d.ts',
      'use-ui-completion.d.ts',
    ]
      .map((filename) =>
        readFileSync(join(reactDistPath, 'src/hooks', filename), 'utf8'),
      )
      .join('\n');
    expect(sharedStateDeclarations).not.toContain('ɵ');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  } finally {
    rmSync(sandboxPath, { recursive: true, force: true });
  }
}, 120_000);
