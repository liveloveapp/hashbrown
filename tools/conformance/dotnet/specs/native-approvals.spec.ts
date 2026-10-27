import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createAppDriver } from '../../harness/app-driver';
import {
  control,
  projectModelApi,
  withDurableCluster,
} from '../harness/browser-fixture';
import type { DotnetFixture, ModelRequest } from '../harness/http-fixture';
import { expectNativeRunCapture, nativeHistory } from '../harness/native-wire';
import {
  type RoutedEndpoint,
  withRoutedEndpoint,
} from '../harness/routed-endpoint';

const environment = {
  FixtureNativeSessions: 'true',
  FixtureNativeApprovals: 'true',
  Workflow: '',
};
const answer = 'Native approval complete';
const pageDiagnostics = new WeakMap<Page, string[]>();
const rejection = 'Tool call invocation rejected.';
const cancellation = `${rejection} Cancelled by caller.`;
const browserRejection = `${rejection} No approval response was provided for this approval required tool call.`;
type Decision = 'approve' | 'decline' | 'cancel';
type Call = {
  id: string;
  name: string;
  arguments: { code: string } | { city: string };
};
type Pair = Call & { output: string | object };
/** Creates a generic protected call; the native framework supplies approval objects. */
const airport = (id: string, code = 'PDX'): Call => ({
  id,
  name: 'lookupAirport',
  arguments: { code },
});
/** Creates a browser call whose distinct city correlates handler entries by argument. */
const weather = (id: string, city: string): Call => ({
  id,
  name: 'getWeather',
  arguments: { city },
});
const airports = [
  airport('protected-0'),
  airport('protected-1', 'LAX'),
  airport('protected-2', 'SFO'),
];
const fresh = weather('fresh-browser', 'Fresh city');
const scenarios = [
  { name: 'native-only', calls: [airport('protected')], sequential: false },
  {
    name: 'browser-first',
    calls: [weather('old-browser', 'Old city'), airport('protected')],
    sequential: false,
  },
  {
    name: 'server-first',
    calls: [airport('protected'), weather('old-browser', 'Old city')],
    sequential: false,
  },
  {
    name: 'two-browser-two-protected',
    calls: [
      weather('old-one', 'Old city one'),
      airport('protected-one'),
      weather('old-two', 'Old city two'),
      airport('protected-two', 'SEA'),
    ],
    sequential: false,
  },
  {
    name: 'sequential-browser-then-protected',
    calls: [weather('initial-browser', 'Initial city'), airport('protected')],
    sequential: true,
  },
] as const;

/** Opens only the public runtime and zero-retry transport. */
async function open(page: Page, endpoint: string) {
  browserErrors(page);
  await page.goto(
    `/?${new URLSearchParams({ scenario: 'tool', runUrl: endpoint, recoveryUrl: new URL(endpoint).origin, recoveryMode: 'native', fixturePrincipal: 'alice', retries: '0' })}`,
  );
  return createAppDriver(page);
}

/** Reads independent journal metadata and append-only effect rows, never authority. */
async function state(fixture: DotnetFixture, page: Page, verify = true) {
  const threadId = await page.getByTestId('recovery-thread').textContent();
  const response = await fetch(
    `${fixture.url}/__test/native-approval-state?threadId=${encodeURIComponent(threadId ?? '')}`,
    { headers: { 'X-Fixture-Principal': 'alice' } },
  );
  expect(response.status).toBe(200);
  const observed = await response.json();
  if (verify) expectApprovalObservation(observed);
  return observed;
}

/** Preserves literal public bytes, original model bodies and independent rows per case. */
async function evidence(
  info: TestInfo,
  endpoint: RoutedEndpoint,
  fixtures: readonly DotnetFixture[],
  page: Page,
  extra: object = {},
) {
  const observed = await state(fixtures[fixtures.length - 1], page, false);
  const value = {
    project: info.project.name,
    title: info.title,
    browserDiagnostics: browserErrors(page),
    publicRequests: endpoint.requests,
    publicResponses: endpoint.responses,
    workers: fixtures.map((fixture) => ({
      url: fixture.url,
      requests: fixture.requests,
      diagnostics: fixture.diagnostics(),
    })),
    observed,
    ...extra,
  };
  const body = JSON.stringify(value, null, 2);
  await info.attach('native-approval-wire-model-effects', {
    body,
    contentType: 'application/json',
  });
  const destination = process.env['DOTNET_NATIVE_BROWSER_EVIDENCE'];
  if (destination) {
    mkdirSync(destination, { recursive: true });
    appendFileSync(
      join(destination, 'observations.jsonl'),
      `${JSON.stringify(value)}\n`,
    );
  }
  expectApprovalObservation(observed);
  expectPublicApprovalCapture(endpoint, observed);
  expect(browserErrors(page)).toEqual([]);
  if ('peerDiagnostics' in extra)
    expect(extra.peerDiagnostics).toEqual([
      'Failed to load resource: the server responded with a status of 409 (Conflict)',
    ]);
}

/** Computes genuine native outcomes without constructing native approval objects. */
function pair(call: Call, decision: Decision, browserCompleted = false): Pair {
  return {
    ...call,
    output:
      call.name === 'getWeather'
        ? browserCompleted
          ? { ...call.arguments, temperatureC: 21, condition: 'sunny' }
          : browserRejection
        : decision === 'approve'
          ? { ...call.arguments, name: 'Portland International Airport' }
          : decision === 'decline'
            ? rejection
            : cancellation,
  };
}

/** Compares exact native serialization semantically for structured function outputs. */
function sameOutput(value: unknown, expected: string | object): boolean {
  if (typeof expected === 'string') return value === expected;
  if (typeof value !== 'string') return false;
  try {
    return JSON.stringify(JSON.parse(value)) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

/** Matches the complete result-ID/output bijection; no wildcard fallback response exists. */
function continuation(
  fixture: DotnetFixture,
  pairs: readonly Pair[],
  response: { content: string } | { toolCalls: Call[] },
) {
  fixture.mock.on(
    {
      predicate: (request) => {
        const results = request.messages.filter(
          (message) => message.role === 'tool',
        );
        return (
          request.messages.at(-1)?.role === 'tool' &&
          results.length === pairs.length &&
          pairs.every(
            (pair) =>
              results.filter(
                (result) =>
                  result.tool_call_id === pair.id &&
                  sameOutput(result.content, pair.output),
              ).length === 1,
          )
        );
      },
    },
    response,
  );
}

/** Keeps public call order fixed and checks provider history by exact owned ID, permitting genuine native grouping. */
function transcript(request: ModelRequest, pairs: readonly Pair[]) {
  const api = projectModelApi();
  const history = nativeHistory(request, api);
  const calls =
    api === 'responses'
      ? history
          .filter((item) => item.type === 'function_call')
          .map((item) => ({
            id: item.call_id,
            name: item.name,
            args: item.arguments,
          }))
      : history
          .flatMap(
            (item) =>
              (item.tool_calls ?? []) as Array<{
                id: string;
                function: { name: string; arguments: string };
              }>,
          )
          .map((item) => ({
            id: item.id,
            name: item.function.name,
            args: item.function.arguments,
          }));
  const results =
    api === 'responses'
      ? history
          .filter((item) => item.type === 'function_call_output')
          .map((item) => ({ id: item.call_id, output: item.output }))
      : history
          .filter((item) => item.role === 'tool')
          .map((item) => ({ id: item.tool_call_id, output: item.content }));
  expect(calls).toHaveLength(pairs.length);
  expect(results).toHaveLength(pairs.length);
  for (const expected of pairs) {
    expect(calls.filter((call) => call.id === expected.id)).toEqual([
      { id: expected.id, name: expected.name, args: expect.any(String) },
    ]);
    expect(
      JSON.parse(calls.find((call) => call.id === expected.id)?.args as string),
    ).toEqual(expected.arguments);
    const output = results.filter((result) => result.id === expected.id);
    expect(output).toHaveLength(1);
    expect(
      sameOutput(output[0].output, expected.output),
      JSON.stringify(output),
    ).toBe(true);
  }
  expect(JSON.stringify(history)).not.toMatch(
    /toolApproval|interruptResponse|requiresConfirmation/,
  );
  if (api === 'responses') {
    expect(request.body.store).toBe(false);
    expect(request.body).not.toHaveProperty('previous_response_id');
    expect(request.body).not.toHaveProperty('conversation');
  }
}

/** Checks the exact public browser declaration and registered server catalog once each. */
function schemas(
  request: ModelRequest,
  original: {
    tools: Array<{ name: string; description: string; parameters: unknown }>;
  },
) {
  const declarations = (request.body.tools as Array<Record<string, unknown>>)
    .map((tool) =>
      projectModelApi() === 'responses'
        ? tool
        : (tool.function as Record<string, unknown>),
    )
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  expect(declarations).toEqual([
    {
      name: 'lookupAirport',
      description: 'Look up an airport by its IATA code.',
      parameters: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string' } },
        additionalProperties: false,
      },
    },
    ...original.tools,
  ]);
}

/** Requires genuine publication before any actionable public approval control. */
async function pending(page: Page, count: number) {
  await expect(page.getByTestId('interrupt-count')).toHaveText(String(count));
  await expect(page.getByTestId('interrupt-batch-id')).not.toBeEmpty();
  await expect(page.getByTestId('resume')).toBeEnabled();
  await createAppDriver(page).expectIdle();
}

/** Submits one complete current batch through the fixture's public resume command. */
async function decide(page: Page, decision: Decision | 'mixed') {
  await page
    .getByTestId(
      decision === 'approve'
        ? 'resume'
        : decision === 'mixed'
          ? 'mixed-decisions'
          : decision,
    )
    .click();
}

/** Ensures public callbacks use genuine current IDs and cancellation carries no payload. */
function callback(endpoint: RoutedEndpoint, decisions: readonly Decision[]) {
  const initial = expectNativeRunCapture(
    endpoint.responses[endpoint.requests.length - 2],
  );
  const terminal = initial.at(-1) as {
    outcome: { interrupts: Array<{ id: string }> };
  };
  const request = JSON.parse(endpoint.requests[endpoint.requests.length - 1]);
  expect(request.resume).toEqual(
    terminal.outcome.interrupts.map((interrupt, index) =>
      decisions[index] === 'cancel'
        ? { interruptId: interrupt.id, status: 'cancelled' }
        : {
            interruptId: interrupt.id,
            status: 'resolved',
            payload: { approved: decisions[index] === 'approve' },
          },
    ),
  );
}

/** Rejects browser console and public SDK guard errors after successful interactions. */
async function clean(page: Page, errors: readonly string[]) {
  for (const id of [
    'resume-error',
    'error',
    'sending-error',
    'generating-error',
    'command-error',
  ])
    await expect(page.getByTestId(id)).toBeEmpty();
  await expect(page.getByTestId('recovery-diagnostic')).toHaveCount(0);
  expect(errors).toEqual([]);
}

/** Captures every browser error without suppressing SDK diagnostics. */
function browserErrors(page: Page) {
  const existing = pageDiagnostics.get(page);
  if (existing) return existing;
  const errors: string[] = [];
  pageDiagnostics.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

for (const scenario of scenarios)
  for (const decision of ['approve', 'decline', 'cancel'] as const) {
    test(`native ${scenario.name} ${decision} preserves public and model identity`, async ({
      page,
    }, info) => {
      const errors = browserErrors(page);
      await withDurableCluster(
        info.project.metadata['provider'] as 'openai' | 'azure',
        async (cluster) => {
          const fixture = await cluster.start();
          const protectedCalls = scenario.calls.filter(
            (call) => call.name === 'lookupAirport',
          );
          const browserCalls = scenario.calls.filter(
            (call) => call.name === 'getWeather',
          );
          const expected = scenario.calls.map((call) =>
            pair(call, decision, scenario.sequential),
          );
          fixture.mock.on(
            {
              userMessage: 'Native approval scenario',
              predicate: (request) => request.messages.at(-1)?.role === 'user',
            },
            {
              toolCalls: scenario.sequential
                ? [browserCalls[0]]
                : [...scenario.calls],
            },
          );
          if (scenario.sequential)
            continuation(fixture, [pair(browserCalls[0], decision, true)], {
              toolCalls: [...protectedCalls],
            });
          continuation(fixture, expected, { toolCalls: [fresh] });
          continuation(fixture, [...expected, pair(fresh, decision, true)], {
            content: answer,
          });
          await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
            const driver = await open(page, endpoint.url);
            try {
              await driver.send('Native approval scenario');
              await pending(page, protectedCalls.length);
              await expect(driver.toolCount()).toHaveText(
                scenario.sequential ? '1' : '0',
              );
              const before = await state(fixture, page);
              expect(before.effects).toEqual([]);
              const initial = expectNativeRunCapture(
                endpoint.responses.at(
                  -1,
                ) as RoutedEndpoint['responses'][number],
              );
              expect(
                initial
                  .filter((event) => event.type === 'TOOL_CALL_START')
                  .map((event) => event.toolCallId),
              ).toEqual(
                (scenario.sequential ? protectedCalls : scenario.calls).map(
                  (call) => call.id,
                ),
              );

              await decide(page, decision);

              await expect(driver.assistant()).toHaveText(answer);
              await driver.expectIdle();
              const resumedIndex = scenario.sequential ? 2 : 1;
              callback(
                {
                  ...endpoint,
                  requests: endpoint.requests.slice(0, resumedIndex + 1),
                  responses: endpoint.responses.slice(0, resumedIndex + 1),
                },
                protectedCalls.map(() => decision),
              );
              transcript(fixture.requests[resumedIndex], expected);
              transcript(fixture.requests[resumedIndex + 1], [
                ...expected,
                pair(fresh, decision, true),
              ]);
              const observed = await state(fixture, page);
              expect(
                observed.effects
                  .map((row: { call_id: string }) => row.call_id)
                  .sort(),
              ).toEqual(
                decision === 'approve'
                  ? protectedCalls.map((call) => call.id).sort()
                  : [],
              );
              expect(
                observed.members
                  .filter(
                    (member: { kind: string }) => member.kind === 'Protected',
                  )
                  .map((member: { decision: string }) => member.decision),
              ).toEqual(
                protectedCalls.map(() =>
                  decision === 'approve'
                    ? 'Approved'
                    : decision === 'decline'
                      ? 'Declined'
                      : 'Cancelled',
                ),
              );
              expect(
                observed.members.filter(
                  (member: { kind: string }) => member.kind === 'BrowserBypass',
                ),
              ).toEqual(
                (scenario.sequential ? [] : browserCalls).map((call) =>
                  expect.objectContaining({
                    call_id: call.id,
                    state: 'Settled',
                    decision: null,
                    admitted_generation: null,
                    admitted_revision: null,
                    resultDigestPresent: true,
                  }),
                ),
              );
              const executed = scenario.sequential
                ? [...browserCalls, fresh]
                : [fresh];
              await expect(page.getByTestId('tool-observations')).toHaveText(
                JSON.stringify(
                  executed.map((call) =>
                    'city' in call.arguments ? call.arguments.city : '',
                  ),
                ),
              );
              const original = JSON.parse(endpoint.requests[0]);
              for (const request of fixture.requests)
                schemas(request, original);
              const allEvents = endpoint.responses.flatMap((capture) =>
                expectNativeRunCapture(capture),
              );
              for (const call of [...scenario.calls, fresh])
                expect(
                  allEvents.filter(
                    (event) =>
                      event.type === 'TOOL_CALL_START' &&
                      event.toolCallId === call.id,
                  ),
                ).toHaveLength(1);
              for (const capture of endpoint.responses.slice(resumedIndex))
                expect(
                  expectNativeRunCapture(capture).filter(
                    (event) =>
                      event.type === 'TOOL_CALL_START' &&
                      protectedCalls.some(
                        (call) => call.id === event.toolCallId,
                      ),
                  ),
                ).toEqual([]);

              await driver.send('Hello fixture');
              await expect(driver.assistant()).toHaveText('Hello from .NET');
              await driver.expectIdle();
              transcript(fixture.requests.at(-1) as ModelRequest, [
                ...expected,
                pair(fresh, decision, true),
              ]);
              expect((await state(fixture, page)).effects).toEqual(
                observed.effects,
              );
              await clean(page, errors);
            } finally {
              await evidence(info, endpoint, [fixture], page, {
                browserCorrelation: 'distinct original arguments',
                callToCity: [...scenario.calls, fresh]
                  .filter((call) => call.name === 'getWeather')
                  .map((call) => ({ id: call.id, ...call.arguments })),
              });
            }
          });
        },
        environment,
      );
    });
  }

test('native three protected decisions approve decline cancel through the public batch', async ({
  page,
}, info) => {
  const errors = browserErrors(page);
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start();
      const old = weather('mixed-old', 'Mixed old city');
      const calls = [...airports, old];
      const expected = calls.map((call, index) =>
        pair(
          call,
          index === 0 ? 'approve' : index === 1 ? 'decline' : 'cancel',
        ),
      );
      fixture.mock.on(
        {
          userMessage: 'Native mixed decisions',
          predicate: (request) => request.messages.at(-1)?.role === 'user',
        },
        { toolCalls: calls },
      );
      continuation(fixture, expected, { content: answer });
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        const driver = await open(page, endpoint.url);
        try {
          await driver.send('Native mixed decisions');
          await pending(page, 3);

          await decide(page, 'mixed');

          await expect(driver.assistant()).toHaveText(answer);
          await driver.expectIdle();
          callback(endpoint, ['approve', 'decline', 'cancel']);
          transcript(fixture.requests[1], expected);
          const events = expectNativeRunCapture(endpoint.responses[0]);
          expect(
            events
              .filter((event) => event.type === 'TOOL_CALL_START')
              .map((event) => event.toolCallId),
          ).toEqual(calls.map((call) => call.id));
          expect((await state(fixture, page)).effects).toEqual([
            expect.objectContaining({ call_id: airports[0].id, code: 'PDX' }),
          ]);
          await expect(page.getByTestId('tool-observations')).toHaveText('[]');
          const original = JSON.parse(endpoint.requests[0]);
          for (const request of fixture.requests) schemas(request, original);
          const completedMixed = await state(fixture, page);
          await page.reload();
          await refresh(page, 'Completed');
          await expect(driver.assistant()).toHaveText(answer);
          await expect(page.getByTestId('interrupt-count')).toHaveText('0');
          await expect(page.getByTestId('tool-observations')).toHaveText('[]');
          expect(fixture.requests).toHaveLength(2);
          expect(await state(fixture, page)).toEqual(completedMixed);
          await driver.send('Hello fixture');
          await expect(driver.assistant()).toHaveText('Hello from .NET');
          await driver.expectIdle();
          transcript(fixture.requests[2], expected);
          expect((await state(fixture, page)).effects).toHaveLength(1);
          await clean(page, errors);
        } finally {
          await evidence(info, endpoint, [fixture], page);
        }
      });
    },
    environment,
  );
});

for (const gate of [
  'before-pending-save',
  'after-save-before-publication',
] as const) {
  test(`native-only pending ${gate} never publishes premature controls`, async ({
    page,
  }, info) => {
    await withDurableCluster(
      info.project.metadata['provider'] as 'openai' | 'azure',
      async (cluster) => {
        const fixture = await cluster.start({ NativeGate: gate });
        fixture.mock.on(
          {
            userMessage: 'Native publication barrier',
            predicate: (request) => request.messages.at(-1)?.role === 'user',
          },
          { toolCalls: [airport('barrier')] },
        );
        continuation(fixture, [pair(airport('barrier'), 'decline')], {
          content: answer,
        });
        await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
          const driver = await open(page, endpoint.url);
          try {
            await driver.send('Native publication barrier');
            await expect
              .poll(
                async () =>
                  (
                    await (
                      await fetch(`${fixture.url}/__test/native-stage`)
                    ).json()
                  ).stage,
              )
              .toBe(gate);
            expect(endpoint.responses[0].body).not.toContain('RUN_FINISHED');
            await expect(page.getByTestId('interrupt-count')).toHaveText('0');
            for (const id of ['resume', 'decline', 'cancel', 'mixed-decisions'])
              await expect(page.getByTestId(id)).toBeDisabled();
            expect((await state(fixture, page)).effects).toEqual([]);
            const original = JSON.parse(endpoint.requests[0]);
            const lookup = await fetch(
              `${fixture.url}/threads/${original.threadId}/native-session`,
              {
                method: 'POST',
                headers: {
                  'X-Fixture-Principal': 'alice',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  tools: original.tools,
                  forwardedProps: original.forwardedProps,
                }),
              },
            );
            expect(await lookup.json()).not.toHaveProperty('snapshot');

            await control(fixture, 'release-native');

            await pending(page, 1);
            await decide(page, 'decline');
            await expect(driver.assistant()).toHaveText(answer);
            await driver.expectIdle();
          } finally {
            await control(fixture, 'release-native');
            await evidence(info, endpoint, [fixture], page);
          }
        });
      },
      environment,
    );
  });
}

test('native live browser decision raw bytes survive real worker death without recovery lookup', async ({
  page,
}, info) => {
  const errors = browserErrors(page);
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const first = await cluster.start();
      const call = airport('restart-protected');
      first.mock.on(
        {
          userMessage: 'Native restart decision',
          predicate: (request) => request.messages.at(-1)?.role === 'user',
        },
        { toolCalls: [call] },
      );
      await withRoutedEndpoint(`${first.url}/run`, async (endpoint) => {
        const driver = await open(page, endpoint.url);
        let raw = '';
        let rawBytes: Buffer = Buffer.alloc(0);
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const lookups: string[] = [];
        page.on('request', (request) => {
          if (request.url().endsWith('/native-session'))
            lookups.push(request.url());
        });
        await page.route(endpoint.url, async (route) => {
          if (
            route.request().method() === 'POST' &&
            route.request().postData()?.includes('"resume"')
          ) {
            rawBytes = route.request().postDataBuffer() ?? Buffer.alloc(0);
            raw = rawBytes.toString('utf8');
            await gate;
          }
          await route.continue();
        });
        let second: DotnetFixture | undefined;
        try {
          await driver.send('Native restart decision');
          await pending(page, 1);
          await decide(page, 'approve');
          await expect.poll(() => raw).not.toBe('');
          expect((await state(first, page)).effects).toEqual([]);
          await first.stop();
          second = await cluster.start();
          continuation(second, [pair(call, 'approve')], { content: answer });
          endpoint.routeTo(`${second.url}/run`);

          release();

          await expect(driver.assistant()).toHaveText(answer);
          await driver.expectIdle();
          expect(endpoint.requests[1]).toBe(raw);
          expect(
            Buffer.from(endpoint.requests[1], 'utf8').equals(rawBytes),
          ).toBe(true);
          expect(first.requests).toHaveLength(1);
          expect(second.requests).toHaveLength(1);
          expect(lookups).toEqual([]);
          expect((await state(second, page)).effects).toEqual([
            expect.objectContaining({ call_id: call.id }),
          ]);
          transcript(second.requests[0], [pair(call, 'approve')]);
          await clean(page, errors);
        } finally {
          release();
          await page.unroute(endpoint.url);
          if (second)
            await evidence(info, endpoint, [first, second], page, {
              heldDecisionRaw: raw,
              heldDecisionBase64: rawBytes.toString('base64'),
            });
        }
      });
    },
    environment,
  );
});

/** Performs the actual public read-only refresh and requires the expected disposition text. */
async function refresh(page: Page, status: string) {
  await page.getByTestId('refresh-recovery').click();
  await expect(page.getByTestId('recovery-status')).toHaveText(status);
  await expect(page.getByTestId('recovery-fetching')).toHaveText('false');
}

for (const decision of ['approve', 'decline', 'cancel'] as const) {
  test(`native cold pending ${decision} renews local ownership and completed history stays inert`, async ({
    page,
  }, info) => {
    const errors = browserErrors(page);
    await withDurableCluster(
      info.project.metadata['provider'] as 'openai' | 'azure',
      async (cluster) => {
        const first = await cluster.start();
        const call = airport('cold-protected');
        first.mock.on(
          {
            userMessage: 'Native cold decision',
            predicate: (request) => request.messages.at(-1)?.role === 'user',
          },
          { toolCalls: [call] },
        );
        await withRoutedEndpoint(`${first.url}/run`, async (endpoint) => {
          const driver = await open(page, endpoint.url);
          await driver.send('Native cold decision');
          await pending(page, 1);
          const oldBatch = await page
            .getByTestId('interrupt-batch-id')
            .textContent();
          const before = await state(first, page);
          await first.stop();
          const second = await cluster.start();
          continuation(second, [pair(call, decision)], { content: answer });
          endpoint.routeTo(`${second.url}/run`);
          try {
            await page.reload();
            const lookup = page.waitForResponse((response) =>
              response.url().endsWith('/native-session'),
            );
            await refresh(page, 'Pending');
            const recovered = await (await lookup).json();
            const initial = expectNativeRunCapture(endpoint.responses[0]).at(
              -1,
            ) as { outcome: { interrupts: unknown[] } };
            expect(recovered.snapshot.interrupts).toEqual(
              initial.outcome.interrupts,
            );
            await pending(page, 1);
            await expect(page.getByTestId('interrupt-batch-id')).not.toHaveText(
              oldBatch ?? '',
            );
            expect(await state(second, page)).toEqual(before);
            expect(second.requests).toHaveLength(0);
            await expect(page.getByTestId('tool-count')).toHaveText('0');

            await decide(page, decision);

            await expect(driver.assistant()).toHaveText(answer);
            await driver.expectIdle();
            transcript(second.requests[0], [pair(call, decision)]);
            const completed = await state(second, page);
            expect(completed.effects).toHaveLength(
              decision === 'approve' ? 1 : 0,
            );
            await page.reload();
            await refresh(page, 'Completed');
            await expect(driver.assistant()).toHaveText(answer);
            await expect(page.getByTestId('interrupt-count')).toHaveText('0');
            expect(second.requests).toHaveLength(1);
            expect(await state(second, page)).toEqual(completed);
            await driver.send('Hello fixture');
            await expect(driver.assistant()).toHaveText('Hello from .NET');
            await driver.expectIdle();
            transcript(second.requests[1], [pair(call, decision)]);
            expect((await state(second, page)).effects).toEqual(
              completed.effects,
            );
            await clean(page, errors);
          } finally {
            await evidence(info, endpoint, [first, second], page, {
              oldLocalBatch: oldBatch,
            });
          }
        });
      },
      environment,
    );
  });
}

test('native mixed real persisted pending reload omits snapshot and blocks work until a fresh thread', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const first = await cluster.start();
      first.mock.on(
        {
          userMessage: 'Native mixed pending reload',
          predicate: (request) => request.messages.at(-1)?.role === 'user',
        },
        {
          toolCalls: [
            weather('unresolved-browser', 'Unresolved city'),
            airport('unresolved-protected'),
          ],
        },
      );
      await withRoutedEndpoint(`${first.url}/run`, async (endpoint) => {
        const driver = await open(page, endpoint.url);
        await driver.send('Native mixed pending reload');
        await pending(page, 1);
        const before = await state(first, page);
        await first.stop();
        const second = await cluster.start();
        endpoint.routeTo(`${second.url}/run`);
        try {
          await page.reload();
          const lookup = page.waitForResponse((response) =>
            response.url().endsWith('/native-session'),
          );
          await refresh(
            page,
            'Pending browser work cannot be restored. Start a new thread.',
          );
          const envelope = await (await lookup).json();
          expect(envelope).toMatchObject({
            disposition: 'Pending',
            reason: 'PendingMixedBrowserResult',
          });
          expect(envelope).not.toHaveProperty('snapshot');
          expect(envelope).not.toHaveProperty('batch');
          expect(await state(second, page)).toEqual(before);
          await expect(page.getByTestId('interrupt-count')).toHaveText('0');
          for (const id of [
            'resume',
            'decline',
            'cancel',
            'mixed-decisions',
            'send',
          ])
            await expect(page.getByTestId(id)).toBeDisabled();
          await expect(page.getByTestId('tool-count')).toHaveText('0');
          expect(second.requests).toHaveLength(0);
          await evidence(info, endpoint, [first, second], page, {
            evidenceLayer: 'real database-backed server recovery',
            envelope,
          });

          await page.getByTestId('new-thread').click();
          await driver.send('Hello fixture');
          await expect(driver.assistant()).toHaveText('Hello from .NET');
          await driver.expectIdle();
          expect(second.requests).toHaveLength(1);
        } finally {
          /* Worker lifetime and schema cleanup are owned by withDurableCluster. */
        }
      });
    },
    environment,
  );
});

for (const variant of [
  'raw',
  'actual-sdk',
  'untimed',
  'server-time',
] as const) {
  test(`native mixed supplied-response SDK guard rejects ${variant} unresolved browser snapshot`, async ({
    page,
  }, info) => {
    await withDurableCluster(
      info.project.metadata['provider'] as 'openai' | 'azure',
      async (cluster) => {
        const fixture = await cluster.start();
        const browser = weather('guard-browser', 'Guard city');
        const protectedCall = airport('guard-protected');
        fixture.mock.on(
          {
            userMessage: 'Native adversarial recovery',
            predicate: (request) => request.messages.at(-1)?.role === 'user',
          },
          { toolCalls: [browser, protectedCall] },
        );
        await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
          const driver = await open(page, endpoint.url);
          let localRaw = '';
          await page.route(endpoint.url, async (route) => {
            if (
              route.request().method() === 'POST' &&
              route.request().postData()?.includes('"resume"')
            ) {
              localRaw = route.request().postData() ?? '';
              await route.abort('aborted');
            } else await route.continue();
          });
          try {
            await driver.send('Native adversarial recovery');
            await pending(page, 1);
            const before = await state(fixture, page);
            const genuine = expectNativeRunCapture(endpoint.responses[0]).at(
              -1,
            ) as { outcome: { interrupts: unknown[] } };
            await decide(page, 'approve');
            await expect.poll(() => localRaw).not.toBe('');
            await driver.expectIdle();
            expect(endpoint.requests).toHaveLength(1);
            const local = JSON.parse(localRaw);
            const genuineBrowserCall = local.messages
              .flatMap(
                (message: {
                  toolCalls?: Array<{ id: string; metadata?: object }>;
                }) => message.toolCalls ?? [],
              )
              .find((call: { id: string }) => call.id === browser.id);
            expect(genuineBrowserCall.metadata).toMatchObject({
              'b4.step': {
                kind: 'server',
                status: 'cancelled',
                settledAt: expect.any(Number),
              },
            });
            expect(local.messages[0]).toMatchObject({
              role: 'system',
              content: 'Runtime smoke system prompt.',
            });
            const snapshot = {
              threadId: local.threadId,
              configuredSystemMessageId: local.messages[0].id,
              messages: local.messages.map(
                (message: {
                  toolCalls?: Array<{
                    id: string;
                    metadata?: Record<string, object>;
                  }>;
                }) => ({
                  ...message,
                  ...(message.toolCalls
                    ? {
                        toolCalls: message.toolCalls.map((call) => {
                          if (
                            call.id !== browser.id ||
                            variant === 'actual-sdk'
                          )
                            return call;
                          const { metadata, ...original } = call;
                          if (variant === 'raw') return original;
                          const step = {
                            ...(metadata?.['b4.step'] ?? {}),
                          } as Record<string, unknown>;
                          if (variant === 'untimed') delete step['settledAt'];
                          else step['settledAt'] = 1700000000000;
                          return {
                            ...original,
                            metadata: { ...metadata, 'b4.step': step },
                          };
                        }),
                      }
                    : {}),
                }),
              ),
              interrupts: genuine.outcome.interrupts,
            };
            const supplied = {
              schemaVersion: 1,
              disposition: 'Pending',
              serverRevision: before.session.revision,
              snapshot,
            };
            await page.unroute(endpoint.url);
            await page.reload();
            await page.route('**/threads/*/native-session', (route) =>
              route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(supplied),
              }),
            );

            await page.getByTestId('refresh-recovery').click();

            await expect(page.getByTestId('recovery-fetching')).toHaveText(
              'false',
            );
            await expect(page.getByTestId('recovery-status')).toContainText(
              'unresolved',
            );
            await expect(page.getByTestId('interrupt-count')).toHaveText('0');
            await expect(page.getByTestId('interrupt-batch-id')).toBeEmpty();
            for (const id of [
              'resume',
              'decline',
              'cancel',
              'mixed-decisions',
              'send',
            ])
              await expect(page.getByTestId(id)).toBeDisabled();
            await expect(driver.toolCount()).toHaveText('0');
            expect(fixture.requests).toHaveLength(1);
            expect(await state(fixture, page)).toEqual(before);
            await evidence(info, endpoint, [fixture], page, {
              evidenceLayer:
                'adversarial supplied response, not server persisted metadata variant',
              variant,
              actualFailedPreReservationSdkRequest: localRaw,
              supplied,
            });
          } finally {
            await page.unroute(endpoint.url);
            await page.unroute('**/threads/*/native-session');
          }
        });
      },
      environment,
    );
  });
}

for (const winner of ['approve', 'decline', 'cancel'] as const) {
  test(`native two cold tabs opposing ${winner} has one admitted envelope and one continuation`, async ({
    page,
    context,
  }, info) => {
    await withDurableCluster(
      info.project.metadata['provider'] as 'openai' | 'azure',
      async (cluster) => {
        const fixture = await cluster.start({
          NativeGate: 'decision-admitted',
        });
        const call = airport('race-protected');
        continuation(fixture, [pair(call, winner)], { content: answer });
        fixture.mock.on(
          {
            userMessage: 'Native opposed tabs',
            predicate: (request) => request.messages.at(-1)?.role === 'user',
          },
          { toolCalls: [call] },
        );
        await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
          const driver = await open(page, endpoint.url);
          await driver.send('Native opposed tabs');
          await pending(page, 1);
          const originalToken = await page
            .getByTestId('interrupt-batch-id')
            .textContent();
          const peer = await context.newPage();
          const peerDiagnostics = browserErrors(peer);
          try {
            await peer.goto(page.url());
            await page.reload();
            await refresh(page, 'Pending');
            await refresh(peer, 'Pending');
            const tokens = [
              originalToken,
              await page.getByTestId('interrupt-batch-id').textContent(),
              await peer.getByTestId('interrupt-batch-id').textContent(),
            ];
            expect(new Set(tokens).size).toBe(3);
            expect(fixture.requests).toHaveLength(1);
            await decide(page, winner);
            await expect
              .poll(
                async () =>
                  (
                    await (
                      await fetch(`${fixture.url}/__test/native-stage`)
                    ).json()
                  ).stage,
              )
              .toBe('decision-admitted');
            const held = await state(fixture, page);
            expect(held.effects).toEqual([]);
            expect(fixture.requests).toHaveLength(1);
            const conflict = peer.waitForResponse(
              (response) =>
                response.url() === endpoint.url &&
                response.request().method() === 'POST',
            );
            await decide(peer, winner === 'approve' ? 'decline' : 'approve');
            expect((await conflict).status()).toBe(409);
            await createAppDriver(peer).expectIdle();
            expect((await state(fixture, page)).effects).toEqual([]);

            await control(fixture, 'release-native');

            await expect(driver.assistant()).toHaveText(answer);
            await driver.expectIdle();
            expect(fixture.requests).toHaveLength(2);
            transcript(fixture.requests[1], [pair(call, winner)]);
            const completed = await state(fixture, page);
            expect(completed.effects).toHaveLength(
              winner === 'approve' ? 1 : 0,
            );
            expect(completed.members).toEqual([
              expect.objectContaining({
                decision:
                  winner === 'approve'
                    ? 'Approved'
                    : winner === 'decline'
                      ? 'Declined'
                      : 'Cancelled',
                admitted_generation: held.members[0].admitted_generation,
                admitted_revision: held.members[0].admitted_revision,
              }),
            ]);
            await refresh(peer, 'Completed');
            await expect(createAppDriver(peer).assistant()).toHaveText(answer);
            await expect(peer.getByTestId('interrupt-count')).toHaveText('0');
            expect(await state(fixture, page)).toEqual(completed);
            expect(fixture.requests).toHaveLength(2);
            await evidence(info, endpoint, [fixture], page, {
              localTokens: tokens,
              loserStatus: 409,
              peerDiagnostics,
              admitted: held,
            });
          } finally {
            await control(fixture, 'release-native');
            await peer.close();
          }
        });
      },
      environment,
    );
  });
}

test('native delayed pending lookup cannot overwrite a newer thread ownership or history', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start();
      fixture.mock.on(
        {
          userMessage: 'Native delayed lookup',
          predicate: (request) => request.messages.at(-1)?.role === 'user',
        },
        { toolCalls: [airport('delayed-protected')] },
      );
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        const driver = await open(page, endpoint.url);
        await driver.send('Native delayed lookup');
        await pending(page, 1);
        const before = await state(fixture, page);
        await page.reload();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let arrived!: () => void;
        const lookup = new Promise<void>((resolve) => {
          arrived = resolve;
        });
        let settled!: () => void;
        const finished = new Promise<void>((resolve) => {
          settled = resolve;
        });
        await page.route('**/threads/*/native-session', async (route) => {
          const response = await route.fetch();
          arrived();
          await gate;
          await route.fulfill({ response });
          settled();
        });
        try {
          await page.getByTestId('refresh-recovery').click();
          await lookup;
          const oldThread = await page
            .getByTestId('recovery-thread')
            .textContent();
          expect(await state(fixture, page)).toEqual(before);
          await expect(page.getByTestId('send')).toBeDisabled();

          await page.getByTestId('new-thread').click();
          await driver.send('Hello fixture');
          await expect(driver.assistant()).toHaveText('Hello from .NET');
          await driver.expectIdle();
          release();
          await finished;
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve()),
              ),
          );

          await expect(page.getByTestId('recovery-thread')).not.toHaveText(
            oldThread ?? '',
          );
          await expect(page.getByTestId('recovery-status')).toBeEmpty();
          await expect(page.getByTestId('interrupt-batch-id')).toBeEmpty();
          await expect(page.getByTestId('send')).toBeEnabled();
          await expect(driver.assistant()).toHaveText('Hello from .NET');
          expect(fixture.requests).toHaveLength(2);
          await evidence(info, endpoint, [fixture], page, {
            oldThread,
            originalPending: before,
          });
        } finally {
          release();
          await page.unroute('**/threads/*/native-session');
        }
      });
    },
    environment,
  );
});

test('native stale public commands cannot replace current local batch ownership or history', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start();
      const call = airport('stale-protected');
      continuation(fixture, [pair(call, 'approve')], { content: answer });
      fixture.mock.on(
        {
          userMessage: 'Native stale commands',
          predicate: (request) => request.messages.at(-1)?.role === 'user',
        },
        { toolCalls: [call] },
      );
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        const driver = await open(page, endpoint.url);
        try {
          await driver.send('Native stale commands');
          await pending(page, 1);
          const originalToken = await page
            .getByTestId('interrupt-batch-id')
            .textContent();
          await page.getByTestId('capture-resume').click();
          const before = await state(fixture, page);
          await refresh(page, 'Pending');
          const currentToken = await page
            .getByTestId('interrupt-batch-id')
            .textContent();
          expect(currentToken).toBeTruthy();
          expect(currentToken).not.toBe(originalToken);

          await page.getByTestId('replay-captured-resume').click();

          await expect(page.getByTestId('resume-error')).toContainText('batch');
          await expect(page.getByTestId('interrupt-batch-id')).toHaveText(
            currentToken ?? '',
          );
          expect(endpoint.requests).toHaveLength(1);
          expect(await state(fixture, page)).toEqual(before);

          await page.getByTestId('replay-last-restore').click();

          await expect(
            page.getByTestId('recovery-command-error'),
          ).toContainText('revision');
          await expect(page.getByTestId('interrupt-batch-id')).toHaveText(
            currentToken ?? '',
          );
          await expect(page.getByTestId('recovery-status')).toHaveText(
            'Pending',
          );
          await expect(driver.assistant()).toBeEmpty();
          await expect(driver.toolCount()).toHaveText('0');
          expect(endpoint.requests).toHaveLength(1);
          expect(fixture.requests).toHaveLength(1);
          expect(await state(fixture, page)).toEqual(before);

          await decide(page, 'approve');
          await expect(driver.assistant()).toHaveText(answer);
          await driver.expectIdle();
          expect((await state(fixture, page)).effects).toEqual([
            expect.objectContaining({ call_id: call.id }),
          ]);
          expect(fixture.requests).toHaveLength(2);
          let release!: () => void;
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          let arrived!: () => void;
          const sending = new Promise<void>((resolve) => {
            arrived = resolve;
          });
          await page.route(endpoint.url, async (route) => {
            if (route.request().method() === 'POST') {
              arrived();
              await held;
            }
            await route.continue();
          });
          try {
            await driver.send('Hello fixture');
            await sending;
            await expect(page.getByTestId('status')).toHaveText('loading');

            await expect(
              page.getByTestId('replay-captured-resume'),
            ).toBeDisabled();

            release();
            await expect(driver.assistant()).toHaveText('Hello from .NET');
            await driver.expectIdle();
            expect(fixture.requests).toHaveLength(3);
            expect((await state(fixture, page)).effects).toHaveLength(1);
          } finally {
            release();
            await page.unrouteAll({ behavior: 'wait' });
          }
          await evidence(info, endpoint, [fixture], page, {
            originalToken,
            currentToken,
            staleCommands:
              'captured public resume token and actual restore expectedRevision',
          });
        } finally {
          /* The real cluster owns worker teardown. */
        }
      });
    },
    environment,
  );
});

/** Bounded journal observation fields needed for independent browser invariants. */
interface ApprovalObservation {
  readonly schemaVersion: number;
  readonly session: { readonly id: string } | null;
  readonly batches: readonly {
    readonly batch_id: string;
    readonly member_count: number;
    readonly admitted_generation: number | null;
    readonly admitted_revision: number | null;
  }[];
  readonly members: readonly {
    readonly kind: string;
    readonly state: string;
    readonly call_id: string;
    readonly request_id: string;
    readonly batch_id: string;
    readonly decision: string | null;
    readonly admitted_generation: number | null;
    readonly admitted_revision: number | null;
    readonly resultDigestPresent: boolean;
  }[];
  readonly invocations: readonly {
    readonly call_id: string;
    readonly state: string;
    readonly dispatch_generation: number | null;
  }[];
  readonly effects: readonly {
    readonly session_id: string;
    readonly call_id: string;
    readonly request_id: string;
    readonly batch_id: string;
    readonly admitted_generation: number;
    readonly admitted_revision: number;
  }[];
}

/** Checks Pending, admitted and settled evidence by exact protected identity without inferring dispatch from aggregate effects. */
function expectApprovalObservation(observed: ApprovalObservation) {
  expect(observed.schemaVersion).toBe(2);
  expect(new Set(observed.members.map((member) => member.call_id)).size).toBe(
    observed.members.length,
  );
  expect(new Set(observed.invocations.map((call) => call.call_id)).size).toBe(
    observed.invocations.length,
  );
  for (const batch of observed.batches)
    expect(
      observed.members.filter((member) => member.batch_id === batch.batch_id),
    ).toHaveLength(batch.member_count);
  expect(observed.invocations.map((call) => call.call_id).sort()).toEqual(
    observed.members
      .filter((member) => member.kind === 'Protected')
      .map((member) => member.call_id)
      .sort(),
  );
  for (const member of observed.members) {
    const effects = observed.effects.filter(
      (effect) => effect.call_id === member.call_id,
    );
    if (member.kind === 'BrowserBypass') {
      expect(['Pending', 'Settled']).toContain(member.state);
      expect(member.decision).toBeNull();
      expect(member.admitted_generation).toBeNull();
      expect(member.admitted_revision).toBeNull();
      expect(member.resultDigestPresent).toBe(member.state === 'Settled');
      expect(effects).toEqual([]);
      continue;
    }
    expect(member.kind).toBe('Protected');
    const calls = observed.invocations.filter(
      (call) => call.call_id === member.call_id,
    );
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (member.state === 'Pending') {
      expect(member.decision).toBeNull();
      expect(member.admitted_generation).toBeNull();
      expect(member.admitted_revision).toBeNull();
      expect(call.state).toBe('Captured');
      expect(call.dispatch_generation).toBeNull();
      expect(effects).toEqual([]);
    } else if (member.state === 'DecisionAdmitted') {
      const batch = observed.batches.find(
        (batch) => batch.batch_id === member.batch_id,
      );
      expect(batch).toBeDefined();
      expect(member.admitted_generation).toBe(batch?.admitted_generation);
      expect(member.admitted_revision).toBe(batch?.admitted_revision);
      expect(['Approved', 'Declined', 'Cancelled']).toContain(member.decision);
      expect(member.admitted_generation).toEqual(expect.any(Number));
      expect(member.admitted_revision).toEqual(expect.any(Number));
      expect(call.state).toBe('Captured');
      expect(call.dispatch_generation).toBeNull();
      expect(effects).toEqual([]);
    } else {
      expect(member.state).toBe('Settled');
      const batch = observed.batches.find(
        (batch) => batch.batch_id === member.batch_id,
      );
      expect(batch).toBeDefined();
      expect(member.admitted_generation).toBe(batch?.admitted_generation);
      expect(member.admitted_revision).toBe(batch?.admitted_revision);
      expect(['Approved', 'Declined', 'Cancelled']).toContain(member.decision);
      expect(member.admitted_generation).toEqual(expect.any(Number));
      expect(member.admitted_revision).toEqual(expect.any(Number));
      expect(call.state).toBe(
        member.decision === 'Approved' ? 'Completed' : member.decision,
      );
      expect(call.dispatch_generation).toBe(
        member.decision === 'Approved' ? member.admitted_generation : null,
      );
      expect(effects).toEqual(
        member.decision === 'Approved'
          ? [
              expect.objectContaining({
                session_id: observed.session?.id,
                call_id: member.call_id,
                request_id: member.request_id,
                batch_id: member.batch_id,
                admitted_generation: member.admitted_generation,
                admitted_revision: member.admitted_revision,
              }),
            ]
          : [],
      );
    }
  }
  for (const effect of observed.effects)
    expect(
      observed.members.filter(
        (member) =>
          member.kind === 'Protected' &&
          member.state === 'Settled' &&
          member.decision === 'Approved' &&
          member.call_id === effect.call_id,
      ),
    ).toHaveLength(1);
}

/** Requires one original public start/end/parent and exact arguments per call; settled native members have one genuine public result. */
function expectPublicApprovalCapture(
  endpoint: RoutedEndpoint,
  observed: ApprovalObservation,
) {
  const events = endpoint.responses
    .filter((capture) => capture.body.startsWith('data:'))
    .flatMap((capture) => expectNativeRunCapture(capture));
  const starts = events.filter((event) => event.type === 'TOOL_CALL_START');
  expect(new Set(starts.map((event) => event.toolCallId)).size).toBe(
    starts.length,
  );
  for (const start of starts) {
    const id = start.toolCallId;
    expect(
      events.filter(
        (event) => event.type === 'TOOL_CALL_END' && event.toolCallId === id,
      ),
    ).toHaveLength(1);
    const args = events
      .filter(
        (event) => event.type === 'TOOL_CALL_ARGS' && event.toolCallId === id,
      )
      .map((event) => event.delta)
      .join('');
    const originalArguments = JSON.parse(args);
    for (const raw of endpoint.requests) {
      const request = JSON.parse(raw);
      const calls = request.messages.flatMap(
        (message: {
          id: string;
          toolCalls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        }) =>
          (message.toolCalls ?? [])
            .filter((call) => call.id === id)
            .map((call) => ({ call, parent: message.id })),
      );
      expect(calls.length).toBeLessThanOrEqual(1);
      for (const item of calls) {
        expect(item.parent).toBe(start.parentMessageId ?? `assistant-${id}`);
        expect(item.call.function.name).toBe(start.toolCallName);
        expect(JSON.parse(item.call.function.arguments)).toEqual(
          originalArguments,
        );
      }
    }
    const members = observed.members.filter((member) => member.call_id === id);
    if (members.length === 1)
      expect(
        events.filter(
          (event) =>
            event.type === 'TOOL_CALL_RESULT' && event.toolCallId === id,
        ),
      ).toHaveLength(members[0].state === 'Settled' ? 1 : 0);
  }
  for (const result of events.filter(
    (event) => event.type === 'TOOL_CALL_RESULT',
  ))
    expect(
      starts.filter((start) => start.toolCallId === result.toolCallId),
    ).toHaveLength(1);
}
