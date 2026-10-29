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
async function storageWorker() {
  let raw, admission, saver, client, settings;
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
        raw = storage.createPostgresPool({
          connectionString: settings.databaseUrl,
          max: 4,
          statement_timeout: 15000,
          connectionTimeoutMillis: 15000,
        });
        admission = storage.createPostgresRunAdmission({
          pool: raw,
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
        if (client) {
          await client.query('ROLLBACK');
          client.release();
          client = undefined;
        }
        await admission.close();
        await saver.close();
        await raw.end();
        result = true;
      } else throw Error('unknown command');
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
