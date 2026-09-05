import {
  type AGUIEvent,
  EventSchemas,
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
}): Promise<{
  url: string;
  inputs: readonly EndpointInput[];
  stop: () => Promise<void>;
}> {
  const inputs: EndpointInput[] = [];
  const encoder = new EventEncoder();
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

    try {
      inputs.push(input);
      const body = options
        .events(input)
        .map((event) => encoder.encode(EventSchemas.parse(event)))
        .join('');
      response.writeHead(200, {
        'Content-Type': encoder.getContentType(),
        'Cache-Control': 'no-cache',
      });
      response.end(body);
    } catch {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid fixture events' }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  let stopping: Promise<void> | undefined;

  return {
    url: `http://127.0.0.1:${port}/run`,
    inputs,
    stop: () =>
      (stopping ??= new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      })),
  };
}
