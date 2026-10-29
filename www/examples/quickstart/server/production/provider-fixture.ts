import { createServer } from 'node:http';

/** Local test-only OpenAI-compatible transport; it drives the real native graph and never enters published recordings. */
export async function startNativeProviderFixture() {
  let requests = 0;
  let toolNames: string[] = [];
  const server = createServer(async (req, res) => {
    if (req.url !== '/v1/chat/completions' || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString()) as {
      tools?: { function?: { name: string } }[];
    };
    requests += 1;
    toolNames = input.tools?.map((tool) => tool.function?.name ?? '') ?? [];
    const base = {
      id: 'chatcmpl-local-native-integration',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'gpt-4.1-mini',
    };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(
      `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: null, tool_calls: [{ index: 0, id: 'call_native_integration', type: 'function', function: { name: 'acceptPlan', arguments: '{}' } }] }, finish_reason: null }] })}\n\n`,
    );
    res.write(
      `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`,
    );
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Provider fixture did not start');
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    requests: () => requests,
    toolNames: () => toolNames,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
