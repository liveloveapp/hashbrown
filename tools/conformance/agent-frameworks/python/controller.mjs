import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

/** Start an isolated real ASGI host; all execution controls use loopback HTTP. */
export async function startPydanticHost({ python, startupTimeoutMs = 15000 } = {}) {
  const cwd = fileURLToPath(new URL('.', import.meta.url));
  const child = spawn(python ?? `${cwd}.venv/bin/python`, ['-m', 'uvicorn', 'host:app', '--host', '127.0.0.1', '--port', '0', '--no-access-log', '--timeout-graceful-shutdown', '2'], { cwd, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  const closed = new Promise((resolve) => child.once('close', resolve));
  child.stderr.on('data', (chunk) => { log = (log + chunk).slice(-16384); });
  const stop = async () => {
    if (child.exitCode !== null || spawnError) { await closed; return; }
    child.kill('SIGTERM');
    const killer = setTimeout(() => child.kill('SIGKILL'), 4000);
    try { await closed; } finally { clearTimeout(killer); }
  };
  const deadline = Date.now() + startupTimeoutMs;
  while (!/Uvicorn running on http:\/\/127.0.0.1:\d+/.test(log)) {
    if (spawnError || child.exitCode !== null || Date.now() > deadline) {
      await stop();
      throw new Error(`Python host did not start: ${spawnError?.message ?? log}`);
    }
    await delay(20);
  }
  const url = log.match(/http:\/\/127.0.0.1:\d+/)[0];
  try {
    const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok || !(await health.json()).ready) throw new Error('Python host health check failed');
  } catch (error) { await stop(); throw error; }
  const request = async (threadId, action) => {
    const response = await fetch(`${url}/control/${encodeURIComponent(threadId)}${action ? `/${action}` : ''}`, { method: action ? 'POST' : 'GET', signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      const error = new Error(`Control HTTP ${response.status}: ${await response.text()}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
  return {
    url,
    state: (threadId) => request(threadId),
    release: (threadId) => request(threadId, 'release'),
    cancel: (threadId) => request(threadId, 'cancel'),
    async waitFor(threadId, predicate, { timeoutMs = 10000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const state = await request(threadId);
          if (predicate(state)) return state;
        } catch (error) { if (error.status !== 404) throw error; }
        await delay(20);
      }
      throw new Error(`Timed out waiting for ${threadId}: ${JSON.stringify(await request(threadId))}`);
    },
    stop,
  };
}
