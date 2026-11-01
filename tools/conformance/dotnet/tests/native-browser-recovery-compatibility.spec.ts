import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withDurableCluster } from '../harness/durable-fixture';
import {
  type DotnetHostSelection,
  resolveDotnetHost,
} from '../harness/dotnet-host';
import { postRun, runInput } from '../harness/http-fixture';

const alice = { 'X-Fixture-Principal': 'alice' };
const browserTool = {
  name: 'getWeather',
  description: 'Get weather',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
    additionalProperties: false,
  },
};
const unavailable =
  '{"hashbrownRecovery":{"version":1,"status":"result-unavailable","effect":"unknown","message":"The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed."}}';
const hash = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

/** Requires the exact retained published NuGet preview1 and npm0.8.3 closures before and after execution. */
function baseline() {
  const pointer = process.env['HASHBROWN_BROWSER_PUBLISHED_METADATA'];
  const npmPointer = process.env['HASHBROWN_BROWSER_PUBLISHED_NPM_METADATA'];
  if (!pointer || !npmPointer)
    throw new Error(
      'Explicit independently retained published NuGet and npm baseline descriptors are required',
    );
  const sha256 = readFileSync(`${pointer}.sha256`, 'utf8').trim();
  const selection: DotnetHostSelection = {
    HASHBROWN_DOTNET_HOST_MODE: 'package',
    HASHBROWN_DOTNET_CONSUMER_METADATA: pointer,
    HASHBROWN_DOTNET_CONSUMER_SHA256: sha256,
  };
  const packagePointer = JSON.parse(readFileSync(pointer, 'utf8'));
  expect(hash(packagePointer.metadata)).toBe(packagePointer.sha256);
  const metadata = JSON.parse(readFileSync(packagePointer.metadata, 'utf8'));
  expect(metadata.identity).toMatchObject({
    id: 'Hashbrown.AspNetCore',
    version: '0.1.0-preview.1',
  });
  expect(metadata.published).toMatchObject({
    signatureVerification: 'passed',
    payloadEquality: 'passed',
  });
  const npm = JSON.parse(readFileSync(npmPointer, 'utf8'));
  for (const name of ['core', 'react', 'angular'])
    expect(npm.packages[`@hashbrownai/${name}`]).toMatchObject({
      version: '0.8.3',
      resolved: `https://registry.npmjs.org/@hashbrownai/${name}/-/${name}-0.8.3.tgz`,
    });
  for (const files of [npm.sources, npm.bundles])
    for (const [file, expected] of Object.entries(files))
      expect(hash(join(npm.directory, file))).toBe(expected);
  const host = resolveDotnetHost(selection);
  expect(host.loaded).toBeDefined();
  return {
    selection,
    nugetPointer: hash(pointer),
    npmPointer: hash(npmPointer),
    metadata: hash(packagePointer.metadata),
    executable: host.executable,
    loaded: host.loaded,
  };
}

for (const mixed of [false, true])
  for (const known of [false, true])
    test(`actual published preview1 rejects explicit ${mixed ? 'mixed' : 'browser-only'} ${known ? 'known' : 'unavailable'} settlement before model or native effect`, async () => {
      const beforeBaseline = baseline();
      await withDurableCluster(
        'openai',
        async ({ start, startPublished }) => {
          const source = await start();
          source.mock.onMessage('Published rejection fixture', {
            toolCalls: [
              {
                id: 'old-browser',
                name: 'getWeather',
                arguments: { city: 'Paris' },
              },
              ...(mixed
                ? [
                    {
                      id: 'old-protected',
                      name: 'lookupAirport',
                      arguments: { code: 'PDX' },
                    },
                  ]
                : []),
            ],
          });
          const input = {
            ...runInput('Published rejection fixture'),
            tools: [browserTool],
          };
          expect(
            (await postRun(source, input, alice)).events.at(-1)?.type,
          ).toBe('RUN_FINISHED');
          const lookup = await fetch(
            `${source.url}/threads/fixture-thread/native-session`,
            {
              method: 'POST',
              headers: {
                ...alice,
                'Content-Type': 'application/json',
                'Hashbrown-Recovery-Version': '2',
              },
              body: JSON.stringify({
                tools: input.tools,
                forwardedProps: input.forwardedProps,
              }),
            },
          );
          expect(lookup.status).toBe(200);
          const pending = await lookup.json();
          expect(pending).toMatchObject({
            schemaVersion: 2,
            disposition: 'Pending',
            snapshot: { pendingBrowserRecovery: { callIds: ['old-browser'] } },
          });
          const observe = async () => {
            const response = await fetch(
              `${source.url}/__test/native-recovery-state?threadId=fixture-thread`,
              { headers: alice },
            );
            expect(response.status).toBe(200);
            return response.json();
          };
          const before = await observe();
          const old = await startPublished(beforeBaseline.selection, [
            source.url,
            source.url,
          ]);
          const oldLookup = await fetch(
            `${old.url}/threads/fixture-thread/native-session`,
            {
              method: 'POST',
              headers: {
                ...alice,
                'Content-Type': 'application/json',
                'Hashbrown-Recovery-Version': '2',
              },
              body: JSON.stringify({
                tools: input.tools,
                forwardedProps: input.forwardedProps,
              }),
            },
          );
          expect(oldLookup.status).toBe(200);
          const legacy = await oldLookup.json();
          expect(legacy.schemaVersion).toBe(1);
          expect(legacy.snapshot?.pendingBrowserRecovery).toBeUndefined();
          const submitted = {
            ...input,
            runId: crypto.randomUUID(),
            messages: [
              ...pending.snapshot.messages,
              {
                id: crypto.randomUUID(),
                role: 'tool',
                toolCallId: 'old-browser',
                content: known ? 'Exact known' : unavailable,
              },
            ],
            resume: pending.snapshot.interrupts?.map(
              (interrupt: { id: string }) => ({
                interruptId: interrupt.id,
                status: 'resolved',
                payload: { approved: true },
              }),
            ),
            forwardedProps: {
              hashbrown: {
                recovery: {
                  version: 1,
                  serverRevision: pending.serverRevision,
                  outcomes: [
                    {
                      toolCallId: 'old-browser',
                      status: known ? 'result' : 'unavailable',
                    },
                  ],
                },
              },
            },
          };
          const statuses: number[] = [];
          for (const request of [
            submitted,
            { ...submitted, state: { changed: true } },
            {
              ...submitted,
              tools: [{ ...browserTool, description: 'Changed declaration' }],
            },
            {
              ...submitted,
              forwardedProps: {
                ...submitted.forwardedProps,
                responseSchema: { type: 'string' },
              },
            },
          ]) {
            const result = await postRun(old, request, alice);
            statuses.push(result.response.status);
            expect(result.response.status).toBe(400);
            expect(result.events).toEqual([]);
            expect(await observe()).toEqual(before);
            expect(old.requests).toHaveLength(0);
          }
          const evidence =
            process.env['HASHBROWN_BROWSER_COMPATIBILITY_EVIDENCE'];
          if (evidence)
            appendFileSync(
              evidence,
              `${JSON.stringify({ mixed, known, statuses, beforeBaseline, oldProcess: old.process, legacy, before, after: await observe(), requests: old.requests })}\n`,
            );
        },
        {
          FixtureNativeSessions: 'true',
          FixtureNativeApprovals: mixed ? 'true' : 'false',
          Workflow: '',
        },
      );
      expect(baseline()).toEqual(beforeBaseline);
    }, 90_000);
