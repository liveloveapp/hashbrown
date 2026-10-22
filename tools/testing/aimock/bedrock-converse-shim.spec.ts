import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collapseBedrockEventStream,
  encodeEventStreamFrame,
  encodeEventStreamMessage,
} from '@copilotkit/aimock';
import {
  decodeEventStreamFrames,
  startBedrockConverseShim,
  wrapConverseEventFrames,
} from './bedrock-converse-shim';
import { startAimock } from './aimock-runner';

function converseStream(): Buffer {
  return Buffer.concat([
    encodeEventStreamMessage('messageStart', { role: 'assistant' }),
    encodeEventStreamMessage('contentBlockStart', {
      contentBlockIndex: 0,
      start: {},
    }),
    encodeEventStreamMessage('contentBlockDelta', {
      contentBlockIndex: 0,
      delta: { reasoningContent: { text: 'Thinking it over.' } },
    }),
    encodeEventStreamMessage('contentBlockStop', { contentBlockIndex: 0 }),
    encodeEventStreamMessage('contentBlockDelta', {
      contentBlockIndex: 1,
      delta: { text: 'Hello ' },
    }),
    encodeEventStreamMessage('contentBlockDelta', {
      contentBlockIndex: 1,
      delta: { text: 'there.' },
    }),
    encodeEventStreamMessage('contentBlockStop', { contentBlockIndex: 1 }),
    encodeEventStreamMessage('contentBlockStart', {
      contentBlockIndex: 2,
      start: { toolUse: { toolUseId: 'tooluse_1', name: 'lookup' } },
    }),
    encodeEventStreamMessage('contentBlockDelta', {
      contentBlockIndex: 2,
      delta: { toolUse: { input: '{"query":' } },
    }),
    encodeEventStreamMessage('contentBlockDelta', {
      contentBlockIndex: 2,
      delta: { toolUse: { input: '"potato"}' } },
    }),
    encodeEventStreamMessage('contentBlockStop', { contentBlockIndex: 2 }),
    encodeEventStreamMessage('messageStop', { stopReason: 'tool_use' }),
  ]);
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test('aimock drops real Converse frames that the shim wraps for it', () => {
  const raw = converseStream();

  const before = collapseBedrockEventStream(raw);
  const after = collapseBedrockEventStream(wrapConverseEventFrames(raw));

  expect(before).toMatchObject({ content: '' });
  expect(after).toMatchObject({
    content: 'Hello there.',
    reasoning: 'Thinking it over.',
    toolCalls: [
      { id: 'tooluse_1', name: 'lookup', arguments: '{"query":"potato"}' },
    ],
  });
  expect(after).not.toHaveProperty('droppedChunks');
  expect(after).not.toHaveProperty('truncated');
});

test('wrapped frames keep the original payload fields and headers', () => {
  const raw = encodeEventStreamMessage('contentBlockDelta', {
    contentBlockIndex: 1,
    delta: { text: 'Hi' },
  });

  const [frame] = decodeEventStreamFrames(wrapConverseEventFrames(raw)).frames;

  expect(frame.headers).toEqual({
    ':content-type': 'application/json',
    ':event-type': 'contentBlockDelta',
    ':message-type': 'event',
  });
  expect(JSON.parse(frame.payload.toString('utf8'))).toEqual({
    contentBlockIndex: 1,
    delta: { text: 'Hi' },
    contentBlockDelta: { contentBlockIndex: 1, delta: { text: 'Hi' } },
  });
});

test('frames that are not JSON events pass through unchanged', () => {
  const exception = encodeEventStreamFrame(
    {
      ':exception-type': 'throttlingException',
      ':content-type': 'application/json',
      ':message-type': 'exception',
    },
    Buffer.from('{"message":"slow down"}'),
  );
  const opaque = encodeEventStreamFrame(
    { ':event-type': 'chunk', ':message-type': 'event' },
    Buffer.from('not json'),
  );
  const raw = Buffer.concat([exception, opaque]);

  const wrapped = wrapConverseEventFrames(raw);

  expect(wrapped.equals(raw)).toBe(true);
});

test('decodeEventStreamFrames keeps an incomplete trailing frame as rest', () => {
  const raw = converseStream();
  const cut = raw.length - 5;

  const decoded = decodeEventStreamFrames(raw.subarray(0, cut));

  expect(decoded.frames.length).toBe(11);
  expect(decoded.rest.length).toBeGreaterThan(0);
  expect(
    Buffer.concat([...decoded.frames.map((f) => f.bytes), decoded.rest]).equals(
      raw.subarray(0, cut),
    ),
  ).toBe(true);
});

test('decodeEventStreamFrames rejects a frame with a bad checksum', () => {
  const raw = Buffer.from(
    encodeEventStreamMessage('messageStop', { stopReason: 'end_turn' }),
  );
  raw[raw.length - 1] ^= 0xff;

  const decode = () => decodeEventStreamFrames(raw);

  expect(decode).toThrow(/checksum/i);
});

test('the shim forwards the request upstream and wraps streamed frames', async () => {
  const seen: { host?: string; signed?: string; body?: string; path?: string } =
    {};
  const upstream = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      seen.host = req.headers.host;
      seen.signed = req.headers['authorization'];
      seen.path = req.url;
      seen.body = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, {
        'content-type': 'application/vnd.amazon.eventstream',
      });
      const raw = converseStream();
      // Split mid-frame to prove frames are reassembled across chunks.
      res.write(raw.subarray(0, 50));
      res.end(raw.subarray(50));
    });
  });
  const upstreamUrl = await listen(upstream);
  const shim = await startBedrockConverseShim({ upstream: upstreamUrl });

  const response = await fetch(
    `${shim.url}/model/us.anthropic.model%3A0/converse-stream`,
    {
      method: 'POST',
      headers: {
        authorization: 'AWS4-HMAC-SHA256 Signature=abc',
        'content-type': 'application/json',
      },
      body: '{"messages":[]}',
    },
  );
  const body = Buffer.from(await response.arrayBuffer());
  await shim.stop();
  await close(upstream);

  expect(response.status).toBe(200);
  expect(seen).toEqual({
    host: new URL(upstreamUrl).host,
    signed: 'AWS4-HMAC-SHA256 Signature=abc',
    path: '/model/us.anthropic.model%3A0/converse-stream',
    body: '{"messages":[]}',
  });
  expect(collapseBedrockEventStream(body)).toMatchObject({
    content: 'Hello there.',
    toolCalls: [{ name: 'lookup', arguments: '{"query":"potato"}' }],
  });
});

test('the shim relays upstream errors unchanged and reports them masked', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(403, {
      'content-type': 'application/json',
      'x-amzn-errortype': 'AccessDeniedException:http://internal/',
    });
    res.end(
      '{"message":"User: arn:aws:iam::123456789012:user/tester is not authorized"}',
    );
  });
  const upstreamUrl = await listen(upstream);
  const reports: string[] = [];
  const shim = await startBedrockConverseShim({
    upstream: upstreamUrl,
    onUpstreamError: (report) => reports.push(report),
  });

  const response = await fetch(`${shim.url}/model/m/converse-stream`, {
    method: 'POST',
    body: '{}',
  });
  const text = await response.text();
  await shim.stop();
  await close(upstream);

  expect(response.status).toBe(403);
  expect(response.headers.get('x-amzn-errortype')).toBe(
    'AccessDeniedException:http://internal/',
  );
  expect(text).toBe(
    '{"message":"User: arn:aws:iam::123456789012:user/tester is not authorized"}',
  );
  expect(reports).toEqual([
    'Bedrock upstream 403 AccessDeniedException: ' +
      '{"message":"User: [arn] is not authorized"}',
  ]);
});

test('aimock records a Converse stream proxied through the shim', async () => {
  const upstream = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, {
        'content-type': 'application/vnd.amazon.eventstream',
      });
      res.end(converseStream());
    });
  });
  const upstreamUrl = await listen(upstream);
  const shim = await startBedrockConverseShim({ upstream: upstreamUrl });
  const root = mkdtempSync(join(tmpdir(), 'bedrock-shim-'));
  const aimock = await startAimock({
    fixturePath: join(root, 'none.json'),
    record: {
      providers: { bedrock: shim.url },
      fixturePath: root,
      secrets: [],
    },
  });

  const response = await fetch(
    `${aimock.url}/model/us.anthropic.model%3A0/converse-stream`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-id': 'shim-e2e' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: [{ text: 'Hi there' }] }],
      }),
    },
  );
  await response.arrayBuffer();
  await aimock.stop();
  await shim.stop();
  await close(upstream);
  const recorded = JSON.parse(
    readFileSync(join(root, 'shim-e2e', 'bedrock.json'), 'utf8'),
  );
  rmSync(root, { recursive: true, force: true });

  expect(response.status).toBe(200);
  expect(recorded.fixtures[0].response).toMatchObject({
    content: 'Hello there.',
    toolCalls: [{ name: 'lookup', arguments: '{"query":"potato"}' }],
  });
});
