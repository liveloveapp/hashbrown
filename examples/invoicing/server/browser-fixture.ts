import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createInvoicingListener } from './src/http';
import { readSessionCookie } from './src/session-cookie';
import { createReviewCoordinator } from './src/review-coordinator';
import { invoicingUiResponseSchema } from '@invoicing/contracts';
import { randomUUID } from 'node:crypto';
import { createSampleLedger } from './src/sample-ledger';
import { createSessionStore } from './src/session-store';
import { createMemoryRepositories } from './src/persistence/memory';
import { type AgUiTape, prepareReplay } from './src/fixture-tape';

// Loaded once at startup; the fixture runs from the repo root (`cwd: ../../..`).
const overdue60Tape: AgUiTape = JSON.parse(
  readFileSync(
    resolve('examples/invoicing/e2e/recordings/overdue-60.agui.json'),
    'utf8',
  ),
);

/** Whether a request targets the assistant agent's AG-UI route. */
function isAssistantAgentRequest(url: string | undefined): boolean {
  if (!url) return false;
  let path: string;
  try {
    path = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return false;
  }
  return path === '/agui//assistant#agent';
}

async function main() {
  // Test-only scripted transport; production continues to use B4 authorization.
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions, createSampleLedger());
  const reviews = createReviewCoordinator(
    store,
    repositories.threads,
    invoicingUiResponseSchema,
  );
  const interrupts = new Map<string, string>();
  const api = createServer(
    createInvoicingListener(store, reviews, (request, response) => {
      if (isAssistantAgentRequest(request.url)) {
        void (async () => {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          // The replay ignores the question text: it always answers with the
          // committed "overdue 60 days" tape, whatever the assistant was
          // asked. That's fine for a deterministic test fixture, never for
          // production.
          const events = prepareReplay(overdue60Tape, {
            threadId: body.threadId,
            runId: body.runId,
          });
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.end(
            events
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join(''),
          );
        })().catch(() => {
          response.writeHead(422, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'invalid_fixture_request' }));
        });
        return;
      }
      if (request.headers['x-invoicing-fixture'] !== 'approval') {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'test_agent_unavailable' }));
        return;
      }
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const sessionId = readSessionCookie(request.headers.cookie);
        if (!sessionId) throw new Error('missing_session');
        const context = await reviews.authorize(sessionId, body);
        const identity = { threadId: body.threadId, runId: body.runId };
        const events: unknown[] = [{ type: 'RUN_STARTED', ...identity }];
        if (body.resume?.length) {
          if (
            context.decision !== 'once' ||
            body.resume[0].interruptId !== interrupts.get(body.threadId)
          )
            throw new Error('invalid_fixture_approval');
          const proposal = await reviews.getProposal(sessionId, body.threadId);
          await reviews.apply(context, proposal.proposalId);
          events.push({ type: 'RUN_FINISHED', ...identity });
        } else {
          const snapshot = await store.snapshot(sessionId);
          const payment = snapshot.payments.find(
            (p) => p.id === context.selectedPaymentId,
          );
          const invoice = snapshot.invoices.find(
            (i) => i.id === context.selectedInvoiceId,
          );
          if (!payment || !invoice) throw new Error('missing_selection');
          const proposal = await reviews.prepare(context, {
            paymentId: payment.id,
            invoiceId: invoice.id,
            amountCents: Math.min(
              payment.unappliedCents,
              invoice.outstandingCents,
            ),
          });
          const interruptId = randomUUID();
          interrupts.set(body.threadId, interruptId);
          events.push(
            {
              type: 'TEXT_MESSAGE_START',
              messageId: proposal.proposalId,
              role: 'assistant',
            },
            {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId: proposal.proposalId,
              delta: JSON.stringify({
                ui: [
                  {
                    AllocationProposal: {
                      props: { proposalId: proposal.proposalId },
                    },
                  },
                ],
              }),
            },
            { type: 'TEXT_MESSAGE_END', messageId: proposal.proposalId },
            {
              type: 'RUN_FINISHED',
              ...identity,
              outcome: {
                type: 'interrupt',
                interrupts: [
                  {
                    id: interruptId,
                    reason: 'tool',
                    metadata: {
                      type: 'permission-request',
                      detail: { toolName: 'applyAllocation' },
                    },
                  },
                ],
              },
            },
          );
        }
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end(
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
        );
      })().catch(() => {
        response.writeHead(422, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'invalid_fixture_request' }));
      });
    }),
  );
  await new Promise<void>((resolve, reject) => {
    api.once('error', reject);
    api.listen(4329, '127.0.0.1', resolve);
  });
  const vite = await createViteServer({
    configFile: 'examples/invoicing/react/vite.config.mts',
    server: {
      port: 4330,
      proxy: {
        '/api': 'http://127.0.0.1:4329',
        '/agui': 'http://127.0.0.1:4329',
      },
    },
  });
  await vite.listen();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      api.close();
      api.closeAllConnections();
      void vite.close();
    });
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
