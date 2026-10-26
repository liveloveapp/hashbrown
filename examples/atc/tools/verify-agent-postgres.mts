import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PINNED_RESPONSE_SCHEMAS } from '../server/src/run-policy';

const repo = resolve(import.meta.dirname, '../../..');
const databaseUrl = process.env['ATC_TEST_DATABASE_URL'];
if (!databaseUrl)
  throw new Error(
    'ATC_TEST_DATABASE_URL must name a disposable Postgres database',
  );

interface Event {
  readonly type: string;
  readonly toolCallId?: string;
  readonly toolCallName?: string;
  readonly delta?: string;
}
interface ModelRequest {
  readonly max_output_tokens: number;
  readonly text: {
    readonly format: { readonly schema: unknown };
  };
  readonly tools: readonly { readonly name: string }[];
  readonly input: readonly {
    readonly type: string;
    readonly call_id?: string;
    readonly output?: string;
  }[];
}

function events(text: string): Event[] {
  return text.split('\n\n').flatMap((frame) => {
    const data = frame.split('\n').find((line) => line.startsWith('data:'));
    return data ? [JSON.parse(data.slice(5)) as Event] : [];
  });
}

async function worker(firstPath: string, secondPath: string): Promise<void> {
  const schema = PINNED_RESPONSE_SCHEMAS[0];
  const captured: ModelRequest[] = [];
  const provider = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    captured.push(
      JSON.parse(Buffer.concat(chunks).toString('utf8')) as ModelRequest,
    );
    const isCall = captured.length === 1;
    const responseId = `response-${captured.length}`;
    const item = isCall
      ? {
          id: 'fc-artifact',
          type: 'function_call',
          call_id: 'artifact-highlight',
          name: 'client_highlightAircraft',
          arguments: '{"hexes":["abc123"]}',
          status: 'completed',
        }
      : {
          id: 'message-artifact',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            { type: 'output_text', text: '{"ui":[]}', annotations: [] },
          ],
        };
    const completed = {
      id: responseId,
      object: 'response',
      model: 'gpt-5-mini',
      status: 'completed',
      output: [item],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };
    const frames = [
      {
        type: 'response.created',
        response: { ...completed, status: 'in_progress', output: [] },
      },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: isCall ? { ...item, arguments: '' } : { ...item, content: [] },
      },
      isCall
        ? {
            type: 'response.function_call_arguments.delta',
            item_id: item.id,
            output_index: 0,
            delta: '{"hexes":["abc123"]}',
          }
        : {
            type: 'response.output_text.delta',
            item_id: item.id,
            output_index: 0,
            content_index: 0,
            delta: '{"ui":[]}',
          },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: completed },
    ];
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(
      frames
        .map(
          (frame, sequence_number) =>
            `event: ${frame.type}\ndata: ${JSON.stringify({ ...frame, sequence_number })}\n\n`,
        )
        .join(''),
    );
  });
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  process.env['OPENAI_API_KEY'] = 'artifact-fixture-only';
  process.env['OPENAI_BASE_URL'] =
    `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;
  process.env['ATC_CHAT_BACKEND'] = 'b4run';
  process.env['ATC_B4RUN_COOKIE_SECRET'] =
    'artifact-fixture-signing-secret-at-least-32-bytes';
  process.env['ATC_B4RUN_DATABASE_URL'] = databaseUrl;
  // The wrapper must use the dedicated database binding rather than this value.
  process.env['DATABASE_URL'] = 'postgresql://unused.invalid/unrelated';
  try {
    const { default: first } = await import(
      pathToFileURL(resolve(firstPath, 'atc.mjs')).href
    );
    const { default: second } = await import(
      pathToFileURL(resolve(secondPath, 'atc.mjs')).href
    );
    const threadId = `artifact-${randomUUID()}`;
    const user = {
      id: 'user',
      role: 'user',
      content: 'Highlight this aircraft',
    };
    const request = (messages: object[], cookie?: string) =>
      new Request('https://atc.test/api/run', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-atc-visitor': 'forged',
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({
          threadId,
          runId: randomUUID(),
          messages,
          tools: [
            {
              name: 'highlightAircraft',
              description: 'untrusted definition',
              parameters: {},
            },
          ],
          state: {},
          context: [],
          forwardedProps: { hashbrown: { responseSchema: schema } },
        }),
      });
    for (const path of [
      '/threads/thread',
      '/agui/%2Fatc%23agent',
      '/healthz',
      '/readyz',
    ]) {
      assert.equal(
        (await second.fetch(new Request(`https://atc.test${path}`))).status,
        404,
      );
    }
    const initial: Response = await first.fetch(request([user]));
    assert.equal(initial.status, 200);
    const cookie = initial.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, 'first artifact must establish a visitor cookie');
    const initialEvents = events(await initial.text());
    assert.equal(
      initialEvents.at(-1)?.type,
      'RUN_FINISHED',
      JSON.stringify(initialEvents),
    );
    assert.ok(
      initialEvents.some(
        (event) =>
          event.type === 'TOOL_CALL_START' &&
          event.toolCallName === 'highlightAircraft' &&
          event.toolCallId === 'artifact-highlight',
      ),
    );
    const history = [
      user,
      {
        id: 'assistant',
        role: 'assistant',
        toolCalls: [
          {
            id: 'artifact-highlight',
            type: 'function',
            function: {
              name: 'highlightAircraft',
              arguments: '{"hexes":["abc123"]}',
            },
          },
        ],
      },
      {
        id: 'result',
        role: 'tool',
        toolCallId: 'artifact-highlight',
        content: '{"ok":true}',
      },
    ];

    const denied: Response = await second.fetch(request(history));
    assert.equal(
      denied.status,
      403,
      'another visitor must not access the stored thread',
    );
    assert.equal(captured.length, 1);
    const resumed: Response = await second.fetch(request(history, cookie));
    assert.equal(resumed.status, 200);
    const resumedEvents = events(await resumed.text());
    assert.equal(
      resumedEvents.at(-1)?.type,
      'RUN_FINISHED',
      JSON.stringify(resumedEvents),
    );
    assert.equal(
      resumedEvents
        .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
        .map((event) => event.delta ?? '')
        .join(''),
      '{"ui":[]}',
      'the final assistant response must reach the browser',
    );
    assert.ok(
      captured[1].input.some(
        (item) =>
          item.type === 'function_call_output' &&
          item.call_id === 'artifact-highlight' &&
          item.output === '{"ok":true}',
      ),
      'the resumed provider must receive the browser result',
    );
    const duplicate: Response = await first.fetch(request(history, cookie));
    assert.equal(duplicate.status, 200);
    assert.equal(events(await duplicate.text()).at(-1)?.type, 'RUN_FINISHED');
    assert.equal(
      captured.length,
      2,
      'duplicate results must not restart the provider',
    );
    for (const body of captured) {
      assert.equal(body.max_output_tokens, 4096);
      assert.deepEqual(body.text.format.schema, schema);
      assert.deepEqual(
        body.tools.map((tool) => tool.name),
        ['client_highlightAircraft'],
      );
    }
    console.log(
      'ATC generated artifacts: shared Postgres continuation, ownership, schema/cap, duplicate results and bypass denial passed',
    );
  } finally {
    provider.closeAllConnections();
    await new Promise<void>((done) => provider.close(() => done()));
  }
}

if (process.argv[2] === '--worker') {
  // Isolate the generated modules in a child; do not depend on private
  // runtime disposal APIs to stop their host.
  void worker(process.argv[3], process.argv[4]).then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
} else {
  const isolated = await mkdtemp(resolve(tmpdir(), 'atc-postgres-artifact-'));
  try {
    const source = resolve(
      repo,
      'examples/atc/.vercel/output/functions/api/run.func',
    );
    const first = resolve(isolated, 'first');
    const second = resolve(isolated, 'second');
    await cp(source, first, { recursive: true });
    await cp(source, second, { recursive: true });
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        fileURLToPath(import.meta.url),
        '--worker',
        first,
        second,
      ],
      {
        cwd: repo,
        stdio: 'inherit',
        timeout: 180_000,
        env: {
          ...process.env,
          TSX_TSCONFIG_PATH: resolve(repo, 'examples/atc/server/tsconfig.json'),
        },
      },
    );
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, 'generated artifact Postgres checks failed');
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
}
