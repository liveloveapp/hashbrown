import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { createRedactor, sha256 } from './common.mjs';
import { createManagedTimeoutIO } from './managed-timeout-io.mjs';
import { createRollbackIO } from './rollback-check.mjs';

for (const adapter of [
  'managed',
  'rollback',
  'rollback-invalid-canonical',
  'rollback-different-canonical',
]) {
  test(
    adapter +
      ' uses fixed model diagnostics without parser or assertion excerpts',
    async () => {
      const stage = await realpath(
        await mkdtemp(join(tmpdir(), 'model-json-boundary-')),
      );
      await writeFile(stage + '/schema.json', '{}');
      const modelText =
        'Sensitive synthetic aircraft commentary with callsign N12345. '.repeat(
          20,
        );
      const canonicalFailure = adapter.startsWith('rollback-');
      let actualBody;
      const credential = 'offline-parser-credential-46a';
      const runId = '46a12345-1234-4234-8234-123456789abc';
      const server = createServer(async (request, response) => {
        let bytes = '';
        for await (const chunk of request) bytes += chunk;
        const body = JSON.parse(bytes);
        actualBody = body;
        const outputText = canonicalFailure
          ? JSON.stringify({ text: body.messages[0].content })
          : modelText;
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'set-cookie': 'atc_visitor=owned-parser-cookie; HttpOnly',
          'x-vercel-id': 'iad1::46a-parser-request',
        });
        for (const event of [
          { type: 'RUN_STARTED', runId: body.runId, threadId: body.threadId },
          { type: 'TEXT_MESSAGE_START', messageId: 'assistant-46a' },
          { type: 'TEXT_MESSAGE_CONTENT', delta: outputText },
          {
            type: 'RUN_FINISHED',
            runId: body.runId,
            threadId: body.threadId,
            model: 'gpt-5.4-mini',
            responseId: 'resp_46a',
          },
        ])
          response.write('data: ' + JSON.stringify(event) + '\n\n');
        response.end();
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const origin = 'http://127.0.0.1:' + server.address().port;
      const context = {
        manifest: { deployments: [{ origin }] },
        secrets: { fixtureCredential: credential },
        redact: createRedactor([credential]),
        databaseErrors: [],
        database: {
          query: async (sql) => ({
            rows: sql.includes('count(*)') ? [{ count: 0 }] : [],
          }),
          end: async () => undefined,
        },
        storage: {
          postgresCheckpointer: () => ({
            listNamespaces: async () => [],
            getTuple: async () => ({
              checkpoint: {
                channel_values: {
                  messages: canonicalFailure
                    ? [
                        {
                          type: 'human',
                          content: actualBody.messages[0].content,
                        },
                        {
                          type: 'ai',
                          content:
                            adapter === 'rollback-invalid-canonical'
                              ? modelText
                              : JSON.stringify({ text: modelText }),
                          response_metadata: { max_output_tokens: 4096 },
                        },
                      ]
                    : [],
                },
              },
            }),
            close: async () => undefined,
          }),
          createPostgresThreadsStore: () => ({
            getThread: async () => ({}),
            close: async () => undefined,
          }),
        },
      };
      const control = {
        signal: new AbortController().signal,
        deadlineMs: Date.now() + 5000,
      };
      const observed = {};
      const bounds = {
        ...control,
        runId,
        input: 'seed',
        backend: canonicalFailure ? 'b4' : 'openai',
        deployment: { id: canonicalFailure ? 'b4' : 'openai' },
        threadId: 'readiness-parser-' + runId,
        onRequestObserved: (value) => Object.assign(observed, value),
      };
      let io, error;
      try {
        io =
          adapter === 'managed'
            ? await createManagedTimeoutIO(
                { schemaPath: stage + '/schema.json' },
                { fault: { deployment: { origin } } },
                control,
                {
                  openContext: async () => context,
                  compileSchema: () => () => true,
                },
              )
            : await createRollbackIO(
                { schemaPath: stage + '/schema.json' },
                { schemaSha256: sha256('{}') },
                { alias: 'readiness-parser.vercel.app' },
                control,
                {
                  openContext: async () => context,
                  Ajv: class {
                    compile() {
                      return () => true;
                    }
                  },
                  fetch: (_, options) => fetch(origin + '/api/run', options),
                  routeProof: async () => {
                    throw Error('invalid output must fail before route proof');
                  },
                },
              );

        try {
          if (adapter === 'managed') await io.request('normal', bounds);
          else await io.request(bounds);
        } catch (caught) {
          error = caught;
        }
        const sanitized = io.redact({
          runId,
          artifactSha256: 'a'.repeat(64),
          observed,
          error,
          credential,
        });

        assert.equal(
          error?.message,
          adapter === 'rollback-different-canonical'
            ? 'canonical model JSON mismatch'
            : 'invalid model JSON',
        );
        assert.equal(error?.cause, undefined);
        assert(!JSON.stringify(sanitized).includes('Sensitive'));
        assert(!JSON.stringify(sanitized).includes(credential));
        assert.equal(sanitized.runId, runId);
        assert.equal(sanitized.artifactSha256, 'a'.repeat(64));
        assert.equal(sanitized.observed.requestId, 'iad1::46a-parser-request');
        assert.equal(sanitized.observed.terminalModel, 'gpt-5.4-mini');
        assert.equal(sanitized.observed.terminalProviderResponseId, 'resp_46a');
      } finally {
        if (io) await io.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        await rm(stage, { recursive: true, force: true });
      }
    },
  );
}
