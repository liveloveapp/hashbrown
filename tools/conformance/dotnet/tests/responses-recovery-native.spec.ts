import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { durableEffects, withDurableCluster } from '../harness/durable-fixture';
import { postRun, runInput } from '../harness/http-fixture';

const message = {
  id: 'msg_native',
  type: 'message',
  role: 'assistant',
  status: 'completed',
  content: [
    { type: 'output_text', text: 'Native final answer', annotations: [] },
  ],
};
const call = {
  id: 'fc_native',
  type: 'function_call',
  call_id: 'call_native',
  name: 'lookupAirport',
  arguments: '{"code":"PDX"}',
  status: 'completed',
};
const variants = [
  'empty',
  'truncated',
  'plain',
  'tool',
  'reasoning',
  'encrypted',
  'hosted',
  'annotations',
  'failed',
  'incomplete',
  'incomplete-completed',
] as const;
type Variant = (typeof variants)[number];

/** Real native Responses wire fixture; only upstream model SSE is generated here. */
async function nativeEndpoint(
  use: (endpoint: {
    url: string;
    select: (variant: Variant) => void;
    requests: Record<string, unknown>[];
  }) => Promise<void>,
) {
  let selected: Variant = 'plain';
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
      string,
      unknown
    >;
    requests.push(body);
    const input = body.input as Array<Record<string, unknown>>;
    const tool =
      selected === 'tool' &&
      !input.some((item) => item.type === 'function_call_output');
    const item = tool ? call : message;
    const output: unknown[] = [item];
    if (selected === 'reasoning')
      output.unshift({
        id: 'rs_native',
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: 'Hidden native reasoning' }],
      });
    if (selected === 'encrypted')
      output.unshift({
        id: 'rs_native',
        type: 'reasoning',
        summary: [],
        encrypted_content: 'opaque-provider-continuation',
      });
    if (selected === 'hosted')
      output.unshift({
        id: 'ws_native',
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'search', query: 'airport' },
      });
    if (selected === 'annotations')
      output[0] = {
        ...message,
        content: [
          {
            ...message.content[0],
            annotations: [
              {
                type: 'url_citation',
                start_index: 0,
                end_index: 6,
                url: 'https://example.com',
                title: 'Native source',
              },
            ],
          },
        ],
      };
    const nativeResponse = (status: string, items: unknown[]) => ({
      id: 'resp_native',
      object: 'response',
      created_at: 1720000000,
      model: body.model,
      store: false,
      status,
      output: items,
    });
    let sequence = 0;
    const emit = (type: string, fields: Record<string, unknown>) =>
      response.write(
        `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...fields })}\n\n`,
      );
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (selected === 'empty') {
      response.end();
      return;
    }
    emit('response.created', { response: nativeResponse('in_progress', []) });
    emit('response.output_item.added', {
      output_index: 0,
      item: {
        ...item,
        status: 'in_progress',
        ...(tool ? { arguments: '' } : { content: [] }),
      },
    });
    if (!tool) {
      emit('response.content_part.added', {
        item_id: message.id,
        output_index: 0,
        content_index: 0,
        part: { ...message.content[0], text: '' },
      });
      emit('response.output_text.delta', {
        item_id: message.id,
        output_index: 0,
        content_index: 0,
        delta: message.content[0].text,
        logprobs: [],
      });
      emit('response.output_text.done', {
        item_id: message.id,
        output_index: 0,
        content_index: 0,
        text: message.content[0].text,
        logprobs: [],
      });
      emit('response.content_part.done', {
        item_id: message.id,
        output_index: 0,
        content_index: 0,
        part: message.content[0],
      });
    }
    emit('response.output_item.done', { output_index: 0, item });
    if (selected !== 'truncated') {
      const failed = selected === 'failed' || selected === 'incomplete';
      const status =
        selected === 'incomplete-completed'
          ? 'incomplete'
          : failed
            ? selected
            : 'completed';
      emit(failed ? `response.${selected}` : 'response.completed', {
        response: {
          ...nativeResponse(status, output),
          ...(selected === 'incomplete' || selected === 'incomplete-completed'
            ? { incomplete_details: { reason: 'max_output_tokens' } }
            : {}),
          ...(selected === 'failed'
            ? { error: { code: 'server_error', message: 'Native failure' } }
            : {}),
        },
      });
    }
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await use({
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      select: (variant) => {
        selected = variant;
      },
      requests,
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

for (const provider of ['openai', 'azure'] as const) {
  test(`${provider} native HTTP Responses recovery rejects pre-adaptation losses and unsuccessful termination`, async () => {
    await nativeEndpoint(async (upstream) => {
      await withDurableCluster(
        provider,
        async (cluster) => {
          const worker = await cluster.start();
          const outcomes: Array<{ variant: Variant; threadId: string }> = [];
          for (const variant of variants) {
            upstream.select(variant);
            const input = { ...runInput(), threadId: `native-${variant}` };
            const pending = await postRun(worker, input, {
              'X-Fixture-Principal': 'alice',
            });
            const interrupts = (
              pending.events.at(-1)?.outcome as {
                interrupts: Array<{ id: string }>;
              }
            ).interrupts;

            const completed = await postRun(
              worker,
              {
                ...input,
                resume: interrupts.map(({ id }) => ({
                  interruptId: id,
                  status: 'resolved',
                  payload: { approved: true },
                })),
              },
              { 'X-Fixture-Principal': 'alice' },
            );
            const result = await fetch(
              `${worker.url}/threads/${input.threadId}/recovery`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Fixture-Principal': 'alice',
                },
                body: JSON.stringify({ tools: [], forwardedProps: {} }),
              },
            );
            const envelope = await result.json();

            const supported = variant === 'plain' || variant === 'tool';
            const terminalFailure =
              variant === 'failed' ||
              variant === 'incomplete' ||
              variant === 'incomplete-completed' ||
              variant === 'empty' ||
              variant === 'truncated';
            if (supported && envelope.transcriptAvailability !== 'Complete')
              throw new Error(
                JSON.stringify({
                  variant,
                  envelope,
                  events: completed.events,
                  logs: worker.diagnostics(),
                }),
              );
            expect({
              variant,
              disposition: envelope.disposition,
              availability: envelope.transcriptAvailability,
            }).toEqual({
              variant,
              disposition: supported
                ? 'Completed'
                : 'CompletedAnswerUnavailable',
              availability: supported ? 'Complete' : 'Original',
            });
            expect(envelope.effectState).toBe('Completed');
            if (terminalFailure)
              expect(
                completed.events.some((event) => event.type === 'RUN_FINISHED'),
              ).toBe(false);
            else
              expect(completed.events.at(-1)).toMatchObject({
                type: 'RUN_FINISHED',
              });
            if (supported)
              expect(envelope.snapshot.messages.at(-1)).toMatchObject({
                role: 'assistant',
                content: message.content[0].text,
              });
            if (variant === 'tool') {
              expect(envelope.snapshot.messages).toContainEqual(
                expect.objectContaining({
                  role: 'tool',
                  toolCallId: call.call_id,
                }),
              );
              expect(upstream.requests.at(-1)?.input).toContainEqual(
                expect.objectContaining({
                  type: 'function_call',
                  call_id: call.call_id,
                  name: call.name,
                }),
              );
              const history = upstream.requests.at(-1)?.input as Array<
                Record<string, unknown>
              >;
              expect(
                JSON.parse(
                  history.find((item) => item.type === 'function_call')
                    ?.arguments as string,
                ),
              ).toEqual(JSON.parse(call.arguments));
              expect(
                history.filter((item) => item.type === 'function_call_output'),
              ).toEqual([
                expect.objectContaining({
                  call_id: call.call_id,
                  output: expect.any(String),
                }),
              ]);
            }
            if (!supported && !terminalFailure) {
              expect(
                completed.events
                  .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
                  .map((event) => event.delta)
                  .join(''),
              ).toBe(message.content[0].text);
            }
            outcomes.push({ variant, threadId: input.threadId });
          }
          await worker.stop();
          const restarted = await cluster.start();
          const before = upstream.requests.length;
          for (const { variant, threadId } of outcomes) {
            const result = await fetch(
              `${restarted.url}/threads/${threadId}/recovery`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Fixture-Principal': 'alice',
                },
                body: JSON.stringify({ tools: [], forwardedProps: {} }),
              },
            );
            expect((await result.json()).transcriptAvailability).toBe(
              variant === 'plain' || variant === 'tool'
                ? 'Complete'
                : 'Original',
            );
          }
          expect(upstream.requests).toHaveLength(before);
          expect(await durableEffects(restarted)).toBe(variants.length);
          for (const request of upstream.requests) {
            expect(request.store).toBe(false);
            expect(request).not.toHaveProperty('previous_response_id');
            expect(request).not.toHaveProperty('conversation');
          }
        },
        {
          ModelApi: 'responses',
          ModelEndpoint: `${upstream.url}${provider === 'openai' ? '/v1' : '/openai/v1'}`,
        },
      );
    });
  }, 120_000);
}
