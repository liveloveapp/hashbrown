import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDirectory = new URL(
  '../../../dist/packages/angular/',
  import.meta.url,
);
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const angularDistPath = fileURLToPath(packageDirectory);
const coreDistPath = join(workspaceRoot, 'dist/packages/core');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const typescriptPath = join(workspaceRoot, 'node_modules/typescript/bin/tsc');
const childProcessTimeoutMs = 90_000;

function assertProcessSucceeded(label, command, args, result) {
  if (!result.error && !result.signal && result.status === 0) {
    return;
  }

  const failureDetails = [
    result.error
      ? `${result.error.code ?? result.error.name}: ${result.error.message}`
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

function runNpm(args, cwd) {
  const result = spawnSync(npmCommand, args, {
    cwd,
    encoding: 'utf8',
    timeout: childProcessTimeoutMs,
  });
  assertProcessSucceeded('npm command', npmCommand, args, result);

  return result.stdout;
}

function packPackage(packagePath, packPath) {
  const output = runNpm(
    ['pack', packagePath, '--json', '--pack-destination', packPath],
    workspaceRoot,
  );
  const filename = JSON.parse(output)[0]?.filename;
  if (!filename) {
    throw new Error(`npm pack did not report a filename for ${packagePath}`);
  }

  return join(packPath, filename);
}

function createPackageSandbox() {
  const sandboxPath = mkdtempSync(join(tmpdir(), 'hashbrown-angular-package-'));
  try {
    const packPath = join(sandboxPath, 'packs');
    mkdirSync(packPath);
    writeFileSync(
      join(sandboxPath, 'package.json'),
      JSON.stringify({
        name: 'hashbrown-angular-package-e2e',
        private: true,
        type: 'module',
      }),
    );
    const coreTarball = packPackage(coreDistPath, packPath);
    const angularTarball = packPackage(angularDistPath, packPath);
    runNpm(
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        coreTarball,
        angularTarball,
        '@angular/common@22.1.1',
        '@angular/compiler@22.1.1',
        '@angular/core@22.1.1',
      ],
      sandboxPath,
    );

    return sandboxPath;
  } catch (error) {
    rmSync(sandboxPath, { recursive: true, force: true });
    throw error;
  }
}

test('published package declares the Angular 22 compatibility boundary', async () => {
  const [packageContents, bundle] = await Promise.all([
    readFile(new URL('package.json', packageDirectory), 'utf8'),
    readFile(
      new URL('fesm2022/hashbrownai-angular.mjs', packageDirectory),
      'utf8',
    ),
  ]);
  const packageJson = JSON.parse(packageContents);

  assert.equal(packageJson.peerDependencies['@angular/core'], '^22.0.0');
  assert.equal(packageJson.peerDependencies['@angular/common'], '^22.0.0');
  assert.equal(packageJson.dependencies['@cacheplane/partial-json'], '0.3.1');
  assert.equal(packageJson.dependencies['@cacheplane/json-stream'], undefined);
  assert.match(bundle, /from ['"]@cacheplane\/partial-json['"]/);
  assert.doesNotMatch(bundle, /from ['"]@cacheplane\/json-stream['"]/);
  assert.match(bundle, /ChangeDetectionStrategy\.Eager/);
});

test(
  'packed Angular and core packages install and load in a clean consumer',
  { timeout: 120_000 },
  () => {
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
            ChatResourceOptions,
            ImperativeJsonParserRef,
            JsonParserRef,
            ProvideHashbrownOptions,
            StructuredChatResourceOptions,
            StructuredCompletionResourceOptions,
            UiChatResourceOptions,
            UiCompletionResourceOptions,
          } from '@hashbrownai/angular';
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
            chatResource,
            completionResource,
            structuredChatResource,
            structuredCompletionResource,
            uiChatResource,
            uiCompletionResource,
          } from '@hashbrownai/angular';
          import { signal } from '@angular/core';
          import { s } from '@hashbrownai/core';

          declare const providerOptions: ProvideHashbrownOptions;
          // The JSON parser injectors return these; consumers must be able to name them.
          declare const jsonParser: JsonParserRef<{ answer: string }>;
          declare const imperativeJsonParser: ImperativeJsonParserRef<{ answer: string }>;
          void jsonParser;
          void imperativeJsonParser;
          declare const structuredChatOptions: StructuredChatResourceOptions<any, any>;
          declare const structuredCompletionOptions: StructuredCompletionResourceOptions<any, any>;
          declare const uiChatOptions: UiChatResourceOptions<any>;
          declare const uiCompletionOptions: UiCompletionResourceOptions<any, any>;

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

          const state = { accountId: 'account-1' };
          const schema = s.object('result', {
            answer: s.string('answer'),
          });
          const input = signal<string | null>('question');

          const chat = chatResource({ system: 'system', state });
          const completion = completionResource({ input, system: 'system', state });
          const structuredChat = structuredChatResource({
            schema,
            system: 'system',
            state,
          });
          const structuredCompletion = structuredCompletionResource({
            input,
            schema,
            system: 'system',
            state,
          });
          const uiChat = uiChatResource({
            components: [],
            system: 'system',
            state,
          });
          for (const result of [chat, structuredChat, uiChat]) {
            const records: readonly SubagentRun[] = result.subagents();
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
          const uiCompletion = uiCompletionResource({
            components: [],
            input,
            system: 'system',
            state,
          });

          chat.state()?.accountId;
          completion.state()?.accountId;
          structuredChat.state()?.accountId;
          structuredCompletion.state()?.accountId;
          uiChat.state()?.accountId;
          uiCompletion.state()?.accountId;
          uiCompletion.setState({ accountId: 'account-2' });
          // @ts-expect-error Inferred state rejects an incompatible setter value.
          uiCompletion.setState({ accountId: 2 });

          const invalidReactiveState: ChatResourceOptions<never, typeof state> = {
            system: 'system',
            // @ts-expect-error Shared state is a plain initial value, not a reactive option.
            state: signal(state),
          };
          void invalidReactiveState;

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
      const args = [
        '--input-type=module',
        '--eval',
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
            await import('@angular/compiler');
            const angular = await import('@hashbrownai/angular');
            const cjsCore = require('@hashbrownai/core');
            const esmCore = await import('@hashbrownai/core');
        for (const core of [cjsCore, esmCore]) {
          const runtime = core.createChatRuntime({ system: 'consumer' });
          const initial = runtime.subagents();
          if (initial.length !== 0 || !Object.isFrozen(initial) || runtime.subagents() !== initial) {
            throw new Error('Packed runtime must expose the frozen native subagent selector');
          }
        }


        for (const api of [angular]) {
          for (const name of ['groupTurns', 'getServerToolCallLabel', 'groupServerToolCalls',
            'collectTurnSources', 'collectTurnAttributions', 'summarizeTurn',
            'formatDuration', 'noFlashRemaining']) {
            if (api[name] !== esmCore[name]) throw new Error('Shared helper mismatch: ' + name);
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


            if (typeof angular.provideHashbrown !== 'function') {
              throw new Error('Angular entrypoint did not expose provideHashbrown');
            }

            if (typeof cjsCore.HttpTransport !== 'function') {
              throw new Error('CJS core did not load the AG-UI transport dependency tree');
            }

            if (typeof esmCore.HttpTransport !== 'function') {
              throw new Error('ESM core did not load the AG-UI transport dependency tree');
            }

            if (
              partialJsonPackage.version !== '0.3.1' ||
              !/^\\^0\\.1\\.\\d+$/.test(
                partialJsonPackage.dependencies?.['@cacheplane/json-stream'] ?? '',
              ) ||
              !/^0\\.1\\.\\d+$/.test(jsonStreamPackage.version)
            ) {
              throw new Error('Angular resolved incompatible Cacheplane packages');
            }
          `,
      ];
      const result = spawnSync(process.execPath, args, {
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
      assertProcessSucceeded(
        'Consumer Node check',
        process.execPath,
        args,
        result,
      );

      assert.equal(result.stderr, '');
      assert.equal(result.status, 0);
    } finally {
      rmSync(sandboxPath, { recursive: true, force: true });
    }
  },
);
