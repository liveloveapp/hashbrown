/** Generated-runtime owner. No credentials or artifact import occurs before private initialization IPC. */
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const send = (value) => {
  try {
    process.send?.(value);
  } catch {
    /* Parent may already have closed IPC during bounded termination. */
  }
};
process.once('message', async ({ id: initializeId, op, settings }) => {
  try {
    if (op !== 'initialize') throw Error('initialization required');
    const env = settings.secrets;
    for (const key of ['OPENAI_API_KEY', 'OPENAI_BASE_URL'])
      if (env[key]) process.env[key] = env[key];
    process.env.ATC_B4RUN_COOKIE_SECRET = env.cookieSecret;
    process.env.ATC_B4RUN_DATABASE_URL = env.databaseUrl;
    process.env.ATC_CHAT_BACKEND = 'b4run';
    process.env.VERCEL = '1';
    let proxy;
    if (settings.proxyUrl) {
      proxy = new URL(settings.proxyUrl);
      if (
        proxy.hostname !== '127.0.0.1' ||
        proxy.protocol !== 'http:' ||
        !/^\/[a-f0-9]{64}\/v1$/.test(proxy.pathname)
      )
        throw Error('invalid private proxy');
      process.env.OPENAI_BASE_URL = proxy.href;
    } else proxy = new URL(env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
    // Test-only observers in this owned process. Never transmit raw reasons, errors, or SSE data.
    const classify = (reason) => {
      const flags = {
        renewalExpired: false,
        databaseFenceExpiredOrReplaced: false,
        ownershipLost: false,
        abort: false,
      };
      const seen = new Set();
      for (
        let item = reason, depth = 0;
        item != null && depth < 12 && !seen.has(item);
        item = typeof item === 'object' ? item.cause : undefined, depth++
      ) {
        seen.add(item);
        const message =
          typeof item === 'string'
            ? item
            : typeof item.message === 'string'
              ? item.message
              : '';
        flags.renewalExpired ||=
          message === 'postgres-storage: run admission lease expired';
        flags.databaseFenceExpiredOrReplaced ||=
          message ===
          'postgres-storage: run admission lease expired or replaced';
        flags.ownershipLost ||=
          message ===
          'postgres-storage: run admission ownership lost or released';
        flags.abort ||=
          item.name === 'AbortError' ||
          item.name === 'APIUserAbortError' ||
          item.code === 'ABORT_ERR' ||
          /^(?:This operation was aborted|The operation was aborted\.?|Request was aborted\.?|The user aborted a request\.?)$/.test(
            message,
          );
      }
      return {
        ...flags,
        admissionLoss:
          flags.renewalExpired || flags.databaseFenceExpiredOrReplaced,
      };
    };
    let admissionLossObserved = false,
      completedBytesConsumed = false,
      providerAbortedBeforeCompletion = false;
    const originalAbort = AbortController.prototype.abort;
    AbortController.prototype.abort = function (...args) {
      const result = Reflect.apply(originalAbort, this, args);
      const classification = classify(this.signal.reason);
      if (classification.admissionLoss || classification.ownershipLost) {
        admissionLossObserved ||= classification.admissionLoss;
        send({ event: 'admission-abort', classification });
      }
      return result;
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async function (input, init) {
      const url =
        typeof input === 'string' || input instanceof URL
          ? String(input)
          : input.url;
      if (url !== proxy.href.replace(/\/$/, '') + '/responses')
        return Reflect.apply(originalFetch, this, [input, init]);
      const signal =
        init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const onAbort = () => {
        providerAbortedBeforeCompletion ||= !completedBytesConsumed;
        send({
          event: 'provider-abort',
          beforeCompletedBytes: !completedBytesConsumed,
          classification: classify(signal?.reason),
        });
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
      let response;
      try {
        response = await Reflect.apply(originalFetch, this, [input, init]);
      } catch (error) {
        send({
          event: 'provider-fetch-failure',
          classification: classify(error),
        });
        throw error;
      }
      if (!response.body) return response;
      const reader = response.body.getReader(),
        decoder = new TextDecoder(),
        hash = createHash('sha256');
      let pending = '';
      const observed = new ReadableStream(
        {
          async pull(controller) {
            try {
              const chunk = await reader.read();
              if (chunk.done) {
                send({
                  event: 'provider-consumption-end',
                  completedBytesConsumed,
                  bodySha256: hash.digest('hex'),
                });
                controller.close();
                return;
              }
              hash.update(chunk.value);
              pending += decoder.decode(chunk.value, { stream: true });
              const frames = pending.replaceAll('\r\n', '\n').split('\n\n');
              pending = frames.pop() ?? '';
              for (const frame of frames) {
                const data = frame
                  .split('\n')
                  .filter((l) => l.startsWith('data:'))
                  .map((l) => l.slice(5).trimStart())
                  .join('\n');
                if (!data || data === '[DONE]') continue;
                if (JSON.parse(data).type === 'response.completed') {
                  completedBytesConsumed = true;
                  send({ event: 'provider-completed-bytes-consumed' });
                }
              }
              controller.enqueue(chunk.value); // Pass through the original bytes, only when the SDK pulls.
            } catch (error) {
              send({
                event: 'provider-stream-failure',
                classification: classify(error),
                beforeCompletedBytes: !completedBytesConsumed,
              });
              controller.error(error);
            }
          },
          cancel(reason) {
            send({
              event: 'provider-stream-cancel',
              classification: classify(reason),
              beforeCompletedBytes: !completedBytesConsumed,
            });
            return reader.cancel(reason);
          },
        },
        { highWaterMark: 0 },
      );
      return new Response(observed, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
    const { default: app } = await import(
      pathToFileURL(settings.artifactPath).href
    );
    let handling = false;
    process.on('message', async ({ op, input, cookie }) => {
      if (op !== 'run') return;
      if (handling) return;
      handling = true;
      let recognizedTerminal = false,
        unexplainedTerminal = false;
      try {
        const response = await app.fetch(
          new Request('https://atc.test/api/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie },
            body: JSON.stringify(input),
          }),
        );
        send({ event: 'headers', status: response.status });
        if (response.status !== 200) {
          await response.body?.cancel();
          send({
            event: 'terminal',
            kind: 'non-200',
            recognizedTerminal: false,
          });
          return;
        }
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let pending = '';
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          pending += decoder.decode(chunk.value, { stream: true });
          const frames = pending.replaceAll('\r\n', '\n').split('\n\n');
          pending = frames.pop() ?? '';
          for (const frame of frames) {
            const data = frame
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart())
              .join('\n');
            if (!data) continue;
            const event = JSON.parse(data),
              classification = classify({
                message: event.message,
                cause: event.error,
              });
            const cancelled =
              event.type === 'RUN_FINISHED' &&
              event.outcome?.type === 'cancelled';
            if (event.type === 'RUN_ERROR' || event.type === 'RUN_FINISHED') {
              const recognized =
                classification.admissionLoss ||
                (admissionLossObserved && (classification.abort || cancelled));
              recognizedTerminal ||= recognized;
              unexplainedTerminal ||= !recognized;
            }
            send({
              event: 'frame',
              type: event.type,
              ...(event.type === 'RUN_ERROR' || event.type === 'RUN_FINISHED'
                ? { classification, cancelled }
                : {}),
            });
          }
        }
        send({
          event: 'terminal',
          kind: 'end',
          recognizedTerminal,
          unexplainedTerminal,
          admissionLossObserved,
          completedBytesConsumed,
          providerAbortedBeforeCompletion,
        });
      } catch (error) {
        const classification = classify(error);
        send({
          event: 'terminal',
          kind: 'exception',
          classification,
          recognizedTerminal:
            classification.admissionLoss ||
            (admissionLossObserved && classification.abort),
          admissionLossObserved,
          completedBytesConsumed,
          providerAbortedBeforeCompletion,
        });
      }
    });
    send({ id: initializeId, ok: true, event: 'ready', pid: process.pid });
  } catch {
    send({ id: initializeId, ok: false, event: 'initialization-failed' });
    process.disconnect?.();
  }
});
