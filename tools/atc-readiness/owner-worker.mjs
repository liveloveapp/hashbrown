/** Owned storage worker and bounded IPC helpers. Credentials arrive through private IPC only. */
import { fork } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveRuntimeDependency, createRedactor } from './common.mjs';

/** A child inherits no ambient database URLs, tokens, runtime flags or loaders. */
export function childEnvironment() {
  return { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' };
}
/** Bound an operation including cleanup; never await an unbounded driver cancellation. */
export async function bounded(
  operation,
  timeoutMs = 20000,
  label = 'operation',
) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error(label + ' timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
/** Track a child created by this caller; reject outstanding commands on exit and resume before termination. */
export function ownedWorker(child, { timeoutMs = 20000 } = {}) {
  const pending = new Map(),
    events = [];
  let seq = 0;
  child.on('message', (m) => {
    events.push(m);
    const p = pending.get(m.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(m.id);
      p.resolve(m);
    }
  });
  child.on('exit', () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error('owned worker exited'));
    }
    pending.clear();
  });
  child.on('error', () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error('owned worker IPC failed'));
    }
    pending.clear();
  });
  return {
    child,
    events,
    command(op, args = {}) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error('owned worker command timed out: ' + op));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try {
          child.send({ id, op, ...args }, (error) => {
            if (error) {
              clearTimeout(timer);
              pending.delete(id);
              reject(Error('owned worker IPC failed'));
            }
          });
        } catch {
          clearTimeout(timer);
          pending.delete(id);
          reject(Error('owned worker IPC failed'));
        }
      });
    },
    async wait(check, limit = timeoutMs) {
      const end = Date.now() + limit;
      for (;;) {
        const event = events.find(check);
        if (event) return event;
        if (child.exitCode !== null || child.signalCode !== null)
          throw Error('owned worker exited');
        if (Date.now() >= end) throw Error('owned worker event timed out');
        await new Promise((r) => setTimeout(r, 10));
      }
    },
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGCONT');
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGKILL');
      await bounded(exited, 5000, 'owned worker termination');
    },
  };
}
/** Fork a fixed local harness entry with a sterile environment and private initialization message. */
export async function startWorker(entry, settings) {
  const worker = ownedWorker(
    fork(entry, [], {
      execArgv: [],
      env: childEnvironment(),
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    }),
  );
  try {
    const result = await worker.command('initialize', { settings });
    if (!result.ok) throw Error('owned worker initialization failed');
    return worker;
  } catch (error) {
    await worker.close();
    throw error;
  }
}
const poolErrors = new WeakMap();
/** Return only fixed-text recorded idle error events; raw driver errors are never retained. */
export function readinessPoolErrors(pool) {
  return poolErrors.get(pool) ?? [];
}
/** Fail closed after any idle pool error, even when subsequent database operations recover. */
export function assertReadinessPoolHealthy(pool) {
  if (readinessPoolErrors(pool).length)
    throw Error('readiness database idle client error observed');
}
/**
 * Build the runtime pool with client deadlines. Replace factory-owned raw warning listeners
 * synchronously, before pool use; onIdleError receives only {event:'database-idle-error'}.
 */
export function createReadinessPool(
  storage,
  databaseUrl,
  max = 5,
  onIdleError = () => {
    /* Caller may inspect recorded safe events instead. */
  },
) {
  const pool = storage.createPostgresPool({
    connectionString: databaseUrl,
    max,
    statement_timeout: 15000,
    query_timeout: 15000,
    connectionTimeoutMillis: 15000,
  });
  const errors = [];
  poolErrors.set(pool, errors);
  // The pinned factory adds its console.warn(String(error)) listener here. Only
  // listeners installed during factory construction exist before this caller uses it.
  for (const listener of pool.listeners('error'))
    pool.removeListener('error', listener);
  pool.on('error', () => {
    const event = { event: 'database-idle-error' };
    errors.push(event);
    try {
      onIdleError({ ...event });
    } catch {
      /* No callback diagnostic may expose raw driver data. */
    }
  });
  return pool;
}
/** Track raw clients beneath the published fenced wrapper, whose release ignores destroy arguments. */
export function trackOwnedPool(raw) {
  const active = new Set();
  return {
    pool: {
      query: (...args) => raw.query(...args),
      connect: async () => {
        const actual = await raw.connect();
        let released = false;
        const client = {
          query: (...args) => actual.query(...args),
          release: (destroy) => {
            if (released) return;
            released = true;
            active.delete(client);
            actual.release(destroy);
          },
        };
        active.add(client);
        return client;
      },
    },
    destroyClients() {
      for (const client of [...active]) client.release(true);
    },
  };
}
/** Bound rollback and every owned resource close; destroy raw checked-out clients before pool shutdown. */
export async function closeOwnedStorage({
  client,
  admission,
  saver,
  pool,
  destroyClients = () => {
    /* Direct-client fixtures need no separate tracker. */
  },
  timeoutMs = 4000,
}) {
  const errors = [];
  if (client) {
    try {
      await bounded(
        client.query('ROLLBACK'),
        timeoutMs,
        'transaction rollback',
      );
    } catch {
      errors.push('transaction rollback failed');
    } finally {
      try {
        client.release(true);
      } catch {
        errors.push('transaction release failed');
      }
    }
  }
  try {
    destroyClients();
  } catch {
    errors.push('raw client destruction failed');
  }
  for (const [label, resource, method] of [
    ['admission', admission, 'close'],
    ['saver', saver, 'close'],
    ['pool', pool, 'end'],
  ])
    if (resource) {
      try {
        await bounded(resource[method](), timeoutMs, label + ' cleanup');
      } catch {
        errors.push(label + ' cleanup failed');
      }
    }
  return errors;
}
async function storageWorker() {
  let raw, admission, saver, client, settings, tracked;
  let redact = createRedactor();
  process.on('message', async (message) => {
    const { id, op } = message;
    const beforeAborted = admission?.signal.aborted;
    try {
      let result;
      if (op === 'initialize') {
        settings = message.settings;
        redact = createRedactor([settings.databaseUrl]);
        if (!/^[a-z_][a-z0-9_]*$/.test(settings.prefix))
          throw Error('invalid prefix');
        const storage = await import(
          pathToFileURL(
            resolveRuntimeDependency(
              settings.runtimeRoot,
              '@b4run/postgres-storage/node',
            ),
          ).href
        );
        raw = createReadinessPool(storage, settings.databaseUrl, 4, (event) =>
          process.send?.(event),
        );
        tracked = trackOwnedPool(raw);
        admission = storage.createPostgresRunAdmission({
          pool: tracked.pool,
          tablePrefix: settings.prefix,
          leaseDurationMs: settings.duration,
          heartbeatIntervalMs: settings.interval,
        });
        saver = storage.postgresCheckpointer({
          pool: admission.pool,
          tablePrefix: settings.prefix,
        });
        await admission.ready();
        await saver.ready();
        result = true;
      } else if (op === 'acquire')
        result = await admission.tryAcquire(message.threadId);
      else if (op === 'put') {
        await saver.put(
          { configurable: { thread_id: message.threadId, checkpoint_ns: '' } },
          {
            v: 4,
            id: message.checkpointId,
            ts: new Date().toISOString(),
            channel_values: { value: message.value },
            channel_versions: { value: 1 },
            versions_seen: {},
          },
          { source: 'loop', step: 1, parents: {} },
          { value: 1 },
        );
        result = true;
      } else if (op === 'begin') {
        client = await admission.pool.connect();
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO ${settings.prefix}_effects (thread_id,value) VALUES ($1,$2)`,
          [message.threadId, message.value],
        );
        result = true;
      } else if (op === 'commit') {
        try {
          await client.query('COMMIT');
          result = true;
        } finally {
          client.release();
          client = undefined;
        }
      } else if (op === 'release') {
        await admission.release();
        result = true;
      } else if (op === 'close') {
        const errors = await closeOwnedStorage({
          client,
          admission,
          saver,
          pool: raw,
          destroyClients: () => tracked?.destroyClients(),
        });
        client = undefined;
        if (errors.length) throw Error(errors.join('; '));
        result = true;
      } else throw Error('unknown command');
      assertReadinessPoolHealthy(raw);
      process.send?.({
        id,
        ok: true,
        result,
        beforeAborted,
        afterAborted: admission?.signal.aborted,
      });
      if (op === 'close') process.disconnect();
    } catch (error) {
      process.send?.({
        id,
        ok: false,
        error: redact(error).message,
        beforeAborted,
        afterAborted: admission?.signal.aborted,
      });
    }
  });
}
if (process.send && process.argv[1] === new URL(import.meta.url).pathname)
  await storageWorker();
