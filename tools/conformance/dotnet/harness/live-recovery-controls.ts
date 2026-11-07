import * as assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Browser } from '@playwright/test';
import { selectReleaseRecoveryPackages } from './live-recovery-package';
import { releaseRecoveryCases } from './live-recovery-manifest';
import { createReleaseRecoveryBudget } from './live-recovery-budget';
import { publicChildEnvironment } from './live-configuration';
import { startLiveStaticServer } from './live-static-server';
import type { ReleaseRecoveryControlMutation } from './live-recovery-control-contract';
import { runLiveRecoveryCase } from './live-recovery-scenario';

/** Genuine local native Responses wire fixture for controls only; its synthetic usage is never live qualification. */
async function deterministicRecoveryEndpoint(
  missingUsage: boolean,
  mutation?: ReleaseRecoveryControlMutation,
) {
  let calls = 0;
  let mutationObserved = false;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > 1024 * 1024) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(bytes);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString());
    calls++;
    const nativeCalls = input.input.filter(
      (item: { type?: string }) => item.type === 'function_call',
    );
    const nativeResults = input.input.filter(
      (item: { type?: string }) => item.type === 'function_call_output',
    );
    const browserCall = nativeCalls.find(
      (item: { name?: string }) => item.name === 'getWeather',
    );
    if (browserCall) {
      const results = nativeResults.filter(
        (item: { call_id?: string }) => item.call_id === browserCall.call_id,
      );
      if (
        mutation === 'missing-original-result' &&
        results.length === 0 &&
        nativeResults.length > 0
      )
        mutationObserved = true;
      if (
        mutation === 'duplicate-original-call' &&
        nativeCalls.filter(
          (item: { call_id?: string }) => item.call_id === browserCall.call_id,
        ).length === 2
      )
        mutationObserved = true;
      if (mutation === 'duplicate-original-result' && results.length === 2)
        mutationObserved = true;
      if (
        mutation === 'wrong-original-result' &&
        results.some(
          (item: { output: string }) =>
            JSON.parse(item.output).temperatureC === 999,
        )
      )
        mutationObserved = true;
    }
    const initial = !input.input.some(
      (item: { type?: string }) => item.type === 'function_call_output',
    );
    const id = `resp_control_${calls}`;
    const output = initial
      ? [
          {
            id: `fc_browser_${calls}`,
            type: 'function_call',
            call_id: `control-browser-${calls}`,
            name: 'getWeather',
            arguments: '{"city":"Paris"}',
            status: 'completed',
          },
          {
            id: `fc_server_${calls}`,
            type: 'function_call',
            call_id: `control-server-${calls}`,
            name: 'lookupAirport',
            arguments: '{"code":"PDX"}',
            status: 'completed',
          },
        ]
      : [
          {
            id: `msg_control_${calls}`,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: 'Paris is sunny and PDX is Portland International Airport.',
                annotations: [],
              },
            ],
          },
        ];
    const result = {
      id,
      object: 'response',
      created_at: 1720000000,
      model: 'gpt-4.1-mini',
      status: 'completed',
      output,
      ...(missingUsage
        ? {}
        : { usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 } }),
    };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    let sequence = 0;
    const emit = (type: string, data: Record<string, unknown>) =>
      response.write(
        `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`,
      );
    emit('response.created', {
      response: { ...result, status: 'in_progress', output: [] },
    });
    for (let index = 0; index < output.length; index++) {
      const item = output[index];
      if (item.type === 'function_call' && 'arguments' in item) {
        emit('response.output_item.added', {
          output_index: index,
          item: { ...item, arguments: '', status: 'in_progress' },
        });
        emit('response.function_call_arguments.delta', {
          item_id: item.id,
          output_index: index,
          delta: item.arguments,
        });
        emit('response.function_call_arguments.done', {
          item_id: item.id,
          output_index: index,
          arguments: item.arguments,
        });
      } else {
        emit('response.output_item.added', {
          output_index: index,
          item: { ...item, status: 'in_progress', content: [] },
        });
        emit('response.content_part.added', {
          item_id: item.id,
          output_index: index,
          content_index: 0,
          part: { type: 'output_text', text: '', annotations: [] },
        });
        emit('response.output_text.delta', {
          item_id: item.id,
          output_index: index,
          content_index: 0,
          delta: 'Paris is sunny and PDX is Portland International Airport.',
        });
        emit('response.output_text.done', {
          item_id: item.id,
          output_index: index,
          content_index: 0,
          text: 'Paris is sunny and PDX is Portland International Airport.',
        });
        emit('response.content_part.done', {
          item_id: item.id,
          output_index: index,
          content_index: 0,
          part: {
            type: 'output_text',
            text: 'Paris is sunny and PDX is Portland International Airport.',
            annotations: [],
          },
        });
      }
      emit('response.output_item.done', { output_index: index, item });
    }
    emit('response.completed', { response: result });
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    calls: () => calls,
    mutationObserved: () => mutationObserved,
    close: async () => {
      const closed = once(server, 'close');
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

/** Runs actual candidate package workers, database and public framework controllers with explicitly labeled deterministic model controls. */
export async function runDeterministicReleaseRecoveryControls(
  browser: Browser,
  environment: Readonly<Record<string, string | undefined>>,
  mutation?: ReleaseRecoveryControlMutation,
) {
  const npmMetadata = environment['HASHBROWN_CANDIDATE_NPM_METADATA'];
  const nugetMetadata = environment['HASHBROWN_CANDIDATE_NUGET_METADATA'];
  const postgres = environment['DOTNET_TEST_POSTGRES'];
  assert.ok(
    npmMetadata && nugetMetadata && postgres,
    'Exact candidate package pointers and actual PostgreSQL required for controls',
  );
  const packages = await selectReleaseRecoveryPackages({
    mode: 'candidate',
    npmMetadata,
    nugetMetadata,
  });
  const budget = createReleaseRecoveryBudget();
  let endpoint:
    Awaited<ReturnType<typeof deterministicRecoveryEndpoint>> | undefined;
  let react: Awaited<ReturnType<typeof startLiveStaticServer>> | undefined;
  let angular: Awaited<ReturnType<typeof startLiveStaticServer>> | undefined;
  const cases: Awaited<ReturnType<typeof runLiveRecoveryCase>>[] = [];
  let blockedCommitObserved = false;
  let primary: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    endpoint = await deterministicRecoveryEndpoint(
      mutation === 'missing-usage',
      mutation,
    );
    react = await startLiveStaticServer(packages.artifacts.react);
    angular = await startLiveStaticServer(packages.artifacts.angular);
    const records = releaseRecoveryCases().filter(
      (record) =>
        record.project.endsWith('openai-key') &&
        (!mutation
          ? true
          : record.id ===
            `react-openai-key/${['hold-finalization', 'malformed-completed-history', 'read-induced-work'].includes(mutation) ? 'result-reconciliation' : 'cold-restore'}`),
    );
    for (const record of records) {
      const allocation = budget.reserveScenario(record.project, record.group);
      try {
        const result = await runLiveRecoveryCase({
          browser,
          record,
          packages,
          postgres,
          origins: { react: react.url, angular: angular.url },
          budget: allocation,
          provider: {
            ...publicChildEnvironment(environment),
            Provider: 'openai',
            ModelApi: 'responses',
            Model: 'gpt-4.1-mini',
            ModelEndpoint: endpoint!.url + '/v1',
            ApiKey: 'deterministic-control-only',
            AzureAuthentication: 'api-key',
            FixtureLiveRecoveryMutation: mutation ?? '',
          },
          deterministicControl: {
            mutation,
            ...(mutation === 'hold-finalization'
              ? {
                  replacementGate: 'before-publication-finalization',
                  observeReplacement: async (
                    worker,
                    proxy,
                    threadId,
                    signal,
                  ) => {
                    while (true) {
                      signal.throwIfAborted();
                      const state = await fetch(
                        `${worker.url}/__test/native-recovery-state?threadId=${encodeURIComponent(threadId)}`,
                        { headers: { 'X-Fixture-Principal': 'alice' }, signal },
                      ).then((response) => response.json());
                      if (state.session?.state === 'Publishing') {
                        assert.equal(
                          proxy
                            .records(threadId)
                            .some((entry) => entry.kind === 'post-commit-loss'),
                          false,
                        );
                        const native = await fetch(
                          `${worker.url}/__test/live-recovery-evidence?threadId=${encodeURIComponent(threadId)}`,
                          {
                            headers: { 'X-Fixture-Principal': 'alice' },
                            signal,
                          },
                        ).then((response) => response.json());
                        assert.equal(
                          native.stages.some(
                            (entry: { stage: string }) =>
                              entry.stage === 'Context.Disposed',
                          ),
                          false,
                        );
                        blockedCommitObserved = true;
                        const response = await fetch(
                          `${worker.url}/__test/release-native`,
                          { method: 'POST', signal },
                        );
                        assert.equal(response.status, 200);
                        return;
                      }
                      await new Promise<void>((done) => setTimeout(done, 20));
                    }
                  },
                }
              : {}),
          },
        });
        cases.push(result);
      } finally {
        allocation.dispose();
      }
    }
  } catch (error) {
    primary = error;
  } finally {
    for (const stop of [
      () => angular?.stop(),
      () => react?.stop(),
      () => endpoint?.close(),
    ])
      try {
        await stop();
      } catch (error) {
        cleanupErrors.push(error);
      }
    budget.dispose();
  }
  if (cleanupErrors.length)
    throw new AggregateError(
      [...(primary ? [primary] : []), ...cleanupErrors],
      'RECOVERY_CONTROL_CLEANUP_FAILED',
    );
  if (primary && mutation && mutation !== 'hold-finalization') {
    const expected: Readonly<Record<string, readonly string[]>> = {
      'missing-usage': ['RECOVERY_USAGE_INVALID'],
      'reused-worker': ['RECOVERY_WORKER_REUSED'],
      'missing-drain': ['RECOVERY_WORKER_DRAIN'],
      'schema-reset': ['RECOVERY_PHYSICAL_STATE_CHANGED'],
      'handler-replay': ['RECOVERY_BROWSER_REPLAY'],
      'effect-replay': ['RECOVERY_EFFECT_REPLAY'],
      'wrong-original-result': ['RECOVERY_RESULT_BINDING_INVALID'],
      'missing-original-result': ['RECOVERY_PROVIDER_HISTORY_INVALID'],
      'duplicate-original-call': ['RECOVERY_PROVIDER_HISTORY_INVALID'],
      'duplicate-original-result': ['RECOVERY_PROVIDER_HISTORY_INVALID'],
      'late-dispatch': ['RECOVERY_LATE_DISPATCH_BLOCKED'],
      'malformed-completed-history': ['RECOVERY_COMPLETED_HISTORY_INVALID'],
      'read-induced-work': ['RECOVERY_COMPLETED_HISTORY_INVALID'],
      'cleanup-crash': ['RECOVERY_WORKER_CLEANUP'],
    };
    if (
      primary instanceof Error &&
      expected[mutation]?.includes(primary.message)
    ) {
      if (mutation === 'missing-usage')
        assert.equal(
          endpoint?.calls(),
          1,
          'Missing usage control did not reach the actual native endpoint',
        );
      if (
        [
          'wrong-original-result',
          'missing-original-result',
          'duplicate-original-call',
          'duplicate-original-result',
        ].includes(mutation)
      )
        assert.equal(
          endpoint?.mutationObserved(),
          true,
          'Actual corrupted native wire did not reach deterministic endpoint',
        );
      throw new Error(`RECOVERY_CONTROL_REJECTED:${mutation}`);
    }
  }
  if (primary) throw primary;
  assert.ok(endpoint);
  return {
    kind: 'deterministic-control' as const,
    cases,
    actualNativeCalls: endpoint.calls(),
    blockedCommitObserved,
  };
}
