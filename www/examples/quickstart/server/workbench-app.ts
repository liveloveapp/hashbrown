import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { EventEncoder } from '@ag-ui/encoder';
import { s } from '@hashbrownai/core';
import express, { type Express } from 'express';
import { workbenchSystem } from '../runtime/workbench';

const responseSchema = s.toJsonSchema(
  s.object('A trusted plan interface', {
    ui: s.array(
      'The generated interface',
      s.object('A trusted component', {
        SummaryCard: s.object('A plan proposal', {
          props: s.object('Plan fields', {
            title: s.string('A short title'),
            steps: s.array('Exactly two short steps', s.string('A step')),
          }),
        }),
      }),
    ),
  }),
);

/** Validates bounded history and fixes the canonical example's provider instructions and schema. */
export function pinWorkbenchInput(value: unknown): RunAgentInput {
  if (JSON.stringify(value).length > 128_000)
    throw new Error('Conversation too large');
  const input = RunAgentInputSchema.parse(value);
  const messages = input.messages.filter(
    (message) => message.role !== 'system' && message.role !== 'developer',
  );
  if (
    messages.length < 1 ||
    messages.length > 80 ||
    !messages.some((message) => message.role === 'user')
  )
    throw new Error('Invalid history');
  if (
    messages.some(
      (message) =>
        message.role === 'user' &&
        (typeof message.content !== 'string' || message.content.length > 2000),
    )
  )
    throw new Error('Prompt too large');
  return {
    ...input,
    messages: [
      { id: 'workbench-system', role: 'system', content: workbenchSystem },
      ...messages,
    ],
    tools: [
      {
        name: 'readContext',
        description:
          'Read the current application plan and revision without changing it.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    ],
    forwardedProps: { hashbrown: { ui: true, responseSchema } },
  };
}

/** Server-owned stream boundary; tests substitute events without changing either SDK client. */
export interface WorkbenchServerOptions {
  readonly stream: (
    input: RunAgentInput,
    signal: AbortSignal,
  ) => AsyncIterable<AGUIEvent>;
  readonly staticDirectory?: string;
  readonly source?: 'provider' | 'test-fixture';
}

/** A loopback development host with bounded input, single-run admission and disconnect cancellation. */
export function createWorkbenchApp(options: WorkbenchServerOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));
  let active = 0;
  app.post('/api/workbench/chat', async (req, res) => {
    const origin = req.get('origin');
    if (origin && origin !== `http://${req.get('host')}`) {
      res.status(403).json({ error: 'Use the local same-origin demo' });
      return;
    }
    let input: RunAgentInput;
    try {
      input = pinWorkbenchInput(req.body);
    } catch {
      res
        .status(400)
        .json({ error: 'Invalid or oversized workbench conversation' });
      return;
    }
    if (active >= 2) {
      res
        .status(429)
        .json({ error: 'Wait for another conversation to finish' });
      return;
    }
    active++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    res.once('close', () => controller.abort());
    const encoder = new EventEncoder();
    try {
      res.writeHead(200, {
        'Content-Type': encoder.getContentType(),
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
        'X-Workbench-Source': options.source ?? 'provider',
      });
      for await (const event of options.stream(input, controller.signal)) {
        if (controller.signal.aborted) break;
        res.write(encoder.encodeSSE(event));
      }
    } catch {
      if (!controller.signal.aborted)
        res.write(
          encoder.encodeSSE({
            type: EventType.RUN_ERROR,
            message:
              'The demo request failed. Check the local server and retry.',
          }),
        );
    } finally {
      clearTimeout(timeout);
      active--;
      res.end();
    }
  });
  app.all('/api/workbench/chat', (_req, res) =>
    res.status(405).json({ error: 'Use POST' }),
  );
  if (options.staticDirectory) app.use(express.static(options.staticDirectory));
  return app;
}
