/** Private loopback proxy: authenticated real provider bytes are buffered unchanged until explicit release. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { sha256, stableStringify } from './common.mjs';
import { bounded } from './owner-worker.mjs';
const excluded = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'accept-encoding',
  'expect',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
]);
/** Create an inert upstream gate; only forward() makes an authenticated provider request. */
export async function createProviderProxy({
  apiKey,
  schema,
  upstreamBase = 'https://api.openai.com/v1',
  fetchImpl = fetch,
}) {
  const base = new URL(upstreamBase);
  assert(
    base.protocol === 'https:' &&
      !base.username &&
      !base.password &&
      !base.search &&
      !base.hash,
  );
  assert(typeof apiKey === 'string' && apiKey.length > 0);
  const nonce = randomBytes(32).toString('hex'),
    sockets = new Set(),
    abort = new AbortController();
  let captured, buffered, failure, receipt;
  let notify;
  const capture = new Promise((resolve) => {
    notify = resolve;
  });
  let delivered;
  const flushed = new Promise((resolve) => {
    delivered = resolve;
  });
  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, `/${nonce}/v1/responses`);
      assert(!captured);
      const actual = Buffer.from(req.headers.authorization ?? ''),
        expected = Buffer.from('Bearer ' + apiKey);
      assert(
        actual.length === expected.length && timingSafeEqual(actual, expected),
      );
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        assert(length < 2_000_000);
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks),
        input = JSON.parse(bytes.toString());
      assert.equal(input.max_output_tokens, 4096);
      assert.equal(input.stream, true);
      assert.equal(
        stableStringify(input.text?.format?.schema),
        stableStringify(schema),
      );
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (!excluded.has(key) && value !== undefined)
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      captured = { bytes, headers };
      notify();
      await released;
      if (!buffered || res.destroyed) return;
      res.writeHead(buffered.status, buffered.headers);
      res.end(buffered.bytes, delivered);
    } catch {
      failure = true;
      notify();
      if (!res.headersSent) res.writeHead(502);
      res.end();
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/${nonce}/v1`,
    async waitCaptured() {
      await bounded(capture, 20000, 'provider capture');
      assert(captured && !failure, 'provider capture failed');
    },
    async forward() {
      assert(captured && !buffered && !failure);
      const result = await fetchImpl(
        base.href.replace(/\/$/, '') + '/responses',
        {
          method: 'POST',
          headers: captured.headers,
          body: captured.bytes,
          redirect: 'error',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(65000)]),
        },
      );
      assert.equal(result.status, 200);
      assert(result.headers.get('content-type')?.includes('text/event-stream'));
      const chunks = [];
      let size = 0;
      const reader = result.body.getReader();
      try {
        for (;;) {
          const next = await bounded(reader.read(), 65000, 'provider response');
          if (next.done) break;
          size += next.value.length;
          assert(size < 8_000_000);
          chunks.push(Buffer.from(next.value));
        }
      } catch (error) {
        abort.abort();
        void reader.cancel().catch(() => {
          /* Preserve upstream failure. */
        });
        throw error;
      }
      const bytes = Buffer.concat(chunks),
        events = bytes
          .toString()
          .replaceAll('\r\n', '\n')
          .split('\n\n')
          .flatMap((frame) => {
            const data = frame
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart())
              .join('\n');
            return data && data !== '[DONE]' ? [JSON.parse(data)] : [];
          });
      assert(
        !events.some((e) =>
          ['response.failed', 'response.incomplete', 'error'].includes(e.type),
        ),
      );
      const completed = events.filter((e) => e.type === 'response.completed');
      assert.equal(completed.length, 1);
      const response = completed[0].response;
      assert.equal(response.status, 'completed');
      assert(response.id);
      assert.equal(response.max_output_tokens, 4096);
      const headers = {};
      for (const [key, value] of result.headers)
        if (
          ![
            'content-length',
            'content-encoding',
            'transfer-encoding',
            'connection',
            'set-cookie',
          ].includes(key)
        )
          headers[key] = value;
      buffered = { bytes, headers, status: result.status };
      receipt = {
        completedMonotonicMs: performance.now(),
        responseId: response.id,
        responseSha256: sha256(bytes),
        requestSha256: sha256(captured.bytes),
        maxOutputTokens: 4096,
        completed: true,
        outputText: response.output
          .flatMap((i) => i.content ?? [])
          .filter((p) => p.type === 'output_text')
          .map((p) => p.text)
          .join(''),
      };
    },
    release() {
      assert(buffered, 'real completed bytes required before release');
      release();
      return bounded(flushed, 5000, 'provider delivery');
    },
    receipt() {
      return receipt;
    },
    async close() {
      abort.abort();
      release();
      for (const socket of sockets) socket.destroy();
      await bounded(
        new Promise((resolve) => server.close(resolve)),
        5000,
        'proxy close',
      );
    },
  };
}
