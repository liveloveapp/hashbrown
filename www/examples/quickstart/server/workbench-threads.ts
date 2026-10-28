import express, { type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { createThreadApp } from './thread-app';
import { createMemoryThreadStore, type ThreadStore } from './thread-store';
import {
  decodeWorkbenchHistory,
  workbenchHistorySystem,
} from '../runtime/workbench-history';
import type { WorkbenchServerOptions } from './workbench-app';

const lessons = ['server-threads', 'public-endpoint'] as const;
const cookieName = 'workbench_demo_session';

function localOrigin(request: Request): string | null {
  try {
    const origin = new URL(`http://${request.get('host')}`);
    return ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
      origin.origin === `http://${request.get('host')}`
      ? origin.origin
      : null;
  } catch {
    return null;
  }
}

/** Creates isolated process-local lesson records behind a loopback-only demo session, never production authentication. */
export function createWorkbenchThreads(options: WorkbenchServerOptions) {
  const app = express();
  const sessions = new Map<
    string,
    {
      owner: string;
      store: ThreadStore;
      threads: Record<string, { Lighthouse: string; Harbor: string }>;
      foreignThreadId: string;
    }
  >();
  let active = 0;
  const session = (req: Request) => {
    const token = req
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    return token ? sessions.get(token) : undefined;
  };
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Workbench-Source': options.source ?? 'provider',
    });
    if (!localOrigin(req)) {
      res.status(403).json({ error: 'Use the loopback local demo host' });
      return;
    }
    next();
  });
  app.get('/session', (req, res) => {
    const current = session(req);
    res.json(
      current
        ? {
            access: 'local-demo',
            threads: current.threads,
            foreignThreadId: current.foreignThreadId,
          }
        : { access: 'anonymous', threads: null, foreignThreadId: null },
    );
  });
  app.post('/session', (req, res) => {
    if (req.get('origin') !== localOrigin(req)) {
      res.status(403).json({ error: 'Use the local same-origin demo' });
      return;
    }
    const token = randomUUID();
    const owner = randomUUID();
    const threads = Object.fromEntries(
      lessons.map((lesson) => [
        lesson,
        { Lighthouse: randomUUID(), Harbor: randomUUID() },
      ]),
    );
    const foreignThreadId = randomUUID();
    const store = createMemoryThreadStore([
      ...Object.values(threads).flatMap((slots) =>
        Object.values(slots).map((id) => ({
          id,
          ownerId: owner,
          messages: [],
        })),
      ),
      { id: foreignThreadId, ownerId: randomUUID(), messages: [] },
    ]);
    sessions.set(token, { owner, threads, store, foreignThreadId });
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/api/workbench/server',
    });
    res.json({ access: 'local-demo', threads, foreignThreadId });
  });
  app.delete('/session', (req, res) => {
    if (req.get('origin') !== localOrigin(req)) {
      res.status(403).json({ error: 'Use the local same-origin demo' });
      return;
    }
    const token = req
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (token) sessions.delete(token);
    res.clearCookie(cookieName, {
      path: '/api/workbench/server',
      httpOnly: true,
      sameSite: 'strict',
    });
    res.json({ access: 'anonymous', threads: null, foreignThreadId: null });
  });
  app.use((req, res, next) => {
    if (!session(req)) {
      res.status(401).json({ error: 'Start a local demo session' });
      return;
    }
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      req.get('origin') !== localOrigin(req)
    ) {
      res.status(403).json({ error: 'Use the local same-origin demo' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  for (const lesson of lessons) {
    app.use(`/${lesson}`, (req, res, next) => {
      const current = session(req);
      const store: ThreadStore = {
        async read(owner, id) {
          if (!current || !Object.values(current.threads[lesson]).includes(id))
            return null;
          return current.store.read(owner, id);
        },
        async compareAndSwap(owner, id, version, messages) {
          const document = decodeWorkbenchHistory(
            JSON.stringify({ version: 1, messages }),
          );
          if (!document) throw new Error('Invalid bounded text');
          return (
            current?.store.compareAndSwap(
              owner,
              id,
              version,
              document.messages,
            ) ?? null
          );
        },
      };
      if (
        req.method === 'PUT' &&
        !decodeWorkbenchHistory(
          JSON.stringify({ version: 1, messages: req.body?.messages }),
        )
      ) {
        // Authentication remains the first boundary, including malformed saves.
        if (!current) {
          res.status(401).json({ error: 'Start a local demo session' });
          return;
        }
        if (req.get('origin') !== localOrigin(req)) {
          res.status(403).json({ error: 'Use the local same-origin demo' });
          return;
        }
        res
          .status(400)
          .json({ error: 'Only bounded completed text can be saved' });
        return;
      }
      if (
        req.method === 'POST' &&
        req.path === '/chat' &&
        current &&
        req.get('origin') === localOrigin(req)
      ) {
        const messages = req.body?.messages;
        if (
          !Array.isArray(messages) ||
          messages.length > 40 ||
          messages.some(
            (message: { role?: unknown; content?: unknown }) =>
              !message ||
              typeof message.content !== 'string' ||
              message.content.length > 2000,
          )
        ) {
          res.status(400).json({ error: 'Invalid bounded text conversation' });
          return;
        }
      }
      const origin = localOrigin(req);
      if (!origin) {
        res.status(403).json({ error: 'Use the loopback local demo host' });
        return;
      }
      const delegate = createThreadApp({
        origin,
        authenticate: async () => current?.owner ?? null,
        allowRun: async () => active < 2,
        store,
        stream: async function* (input, signal) {
          active++;
          try {
            yield* options.stream(
              {
                ...input,
                messages: [
                  {
                    id: 'workbench-system',
                    role: 'system',
                    content: workbenchHistorySystem,
                  },
                  ...input.messages.slice(1),
                ],
              },
              signal,
              lesson,
            );
          } finally {
            active--;
          }
        },
      });
      // Reuse the application's authenticated storage, ownership, admission and disconnect contract.
      const path = req.url;
      req.url = `/api${path}`;
      delegate(req, res, (error?: unknown) => {
        req.url = path;
        next(error);
      });
    });
  }
  return app;
}
