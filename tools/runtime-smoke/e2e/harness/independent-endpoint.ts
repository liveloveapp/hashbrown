import {
  type AGUIEvent,
  EventSchemas,
  EventType,
  type RunAgentInput,
  RunAgentInputSchema,
} from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';

const extendedInputSchema = RunAgentInputSchema.extend({
  hashbrown: z.object({
    responseSchema: z.record(z.string(), z.unknown()),
    ui: z.boolean().optional(),
  }),
});

/** Canonical fixture input with an explicitly negotiated structured-output extension. */
export type EndpointInput = RunAgentInput & {
  hashbrown?: { responseSchema: Record<string, unknown>; ui?: boolean };
};

/** Starts a real HTTP fixture without importing any framework or provider implementation. */
export async function startIndependentEndpoint(options: {
  extended?: boolean;
  events: (input: EndpointInput) => readonly AGUIEvent[];
  /** Optional abortable gate invoked before each event is written. */
  beforeEvent?: (index: number, signal: AbortSignal) => Promise<void>;
}): Promise<{
  url: string;
  inputs: readonly EndpointInput[];
  /** Consumes one matching RUN_FINISHED written to the response. */
  consumeTerminalRun: (runId: string) => boolean;
  stop: () => Promise<void>;
}> {
  const inputs: EndpointInput[] = [];
  const terminalRuns = new Set<string>();
  const encoder = new EventEncoder();
  const deliveries = new Set<AbortController>();
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (request.url !== '/run') {
      response.writeHead(404).end();
      return;
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405).end();
      return;
    }

    let input: EndpointInput;
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const schema = options.extended
        ? extendedInputSchema
        : RunAgentInputSchema;
      input = schema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid run input' }));
      return;
    }

    const delivery = new AbortController();
    const abortDelivery = () => delivery.abort();
    deliveries.add(delivery);
    response.once('close', abortDelivery);
    try {
      inputs.push(input);
      const events = options
        .events(input)
        .map((event) => EventSchemas.parse(event));
      const encoded = events.map((event) => encoder.encode(event));
      const recordTerminal = (index: number) => {
        const event = events[index];
        if (
          event.type === EventType.RUN_FINISHED &&
          event.runId === input.runId &&
          event.threadId === input.threadId
        ) {
          terminalRuns.add(input.runId);
        }
      };
      response.writeHead(200, {
        'Content-Type': encoder.getContentType(),
        'Cache-Control': 'no-cache',
      });
      if (options.beforeEvent) {
        response.flushHeaders();
        for (const [index, event] of encoded.entries()) {
          await options.beforeEvent(index, delivery.signal);
          if (delivery.signal.aborted) return;
          response.write(event);
          recordTerminal(index);
        }
        response.end();
      } else {
        response.end(encoded.join(''));
        events.forEach((_, index) => recordTerminal(index));
      }
    } catch {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid fixture events' }));
    } finally {
      deliveries.delete(delivery);
      response.removeListener('close', abortDelivery);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  let stopping: Promise<void> | undefined;

  return {
    url: `http://127.0.0.1:${port}/run`,
    inputs,
    consumeTerminalRun: (runId) => terminalRuns.delete(runId),
    stop: () =>
      (stopping ??= new Promise<void>((resolve, reject) => {
        for (const delivery of deliveries) delivery.abort();
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      })),
  };
}
