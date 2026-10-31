import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const snapshot = () =>
  execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,stat=,lstart='], {
    encoding: 'utf8',
    timeout: 1000,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .trim()
    .split('\n')
    .map((line) => {
      const [, pid, parent, group, state, started] =
        line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/) ?? [];
      return {
        pid: Number(pid),
        parent: Number(parent),
        group: Number(group),
        state,
        started,
      };
    })
    .filter((entry) => entry.pid > 0);
const same = (left, right) =>
  left.pid === right.pid &&
  left.group === right.group &&
  left.started === right.started;
const signal = (pid, name) => {
  try {
    process.kill(pid, name);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
};

/**
 * Capture the owned tree before termination reparents detached Nx/browser children.
 * Allow graceful Nx cleanup, then kill only survivors matching captured identities.
 * @param pid - Direct child process ID and initial process group leader.
 * @returns Whether bounded cleanup verified that all captured live processes exited.
 */
async function cleanOwnedTree(pid) {
  const owned = new Map();
  const capture = () => {
    const current = snapshot();
    const liveOwned = current.filter(
      (entry) => owned.has(entry.pid) && same(entry, owned.get(entry.pid)),
    );
    const roots = new Set(
      owned.size ? liveOwned.map((entry) => entry.pid) : [pid],
    );
    // A still-owned member anchors group ownership after its leader exits.
    const groups = new Set(
      liveOwned
        .filter((entry) => owned.has(entry.group))
        .map((entry) => entry.group),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const entry of current) {
        if (
          !roots.has(entry.pid) &&
          (roots.has(entry.parent) || groups.has(entry.group))
        ) {
          roots.add(entry.pid);
          changed = true;
        }
        if (roots.has(entry.pid) && entry.pid === entry.group)
          groups.add(entry.group);
      }
    }
    for (const entry of current)
      if (roots.has(entry.pid)) {
        const previous = owned.get(entry.pid);
        if (!previous || same(previous, entry)) owned.set(entry.pid, entry);
      }
    return current.filter(
      (entry) =>
        owned.has(entry.pid) &&
        same(entry, owned.get(entry.pid)) &&
        !entry.state.startsWith('Z'),
    );
  };
  capture();
  signal(-pid, 'SIGTERM');
  const gracefulDeadline = Date.now() + 1000;
  while (Date.now() < gracefulDeadline) {
    if (capture().length === 0) return true;
    await delay(50);
  }
  // Signal individual identities: descendants may own independent detached groups.
  // Re-snapshot immediately before escalation to avoid signaling a reused PID.
  for (const entry of capture().reverse()) signal(entry.pid, 'SIGKILL');
  const killDeadline = Date.now() + 1000;
  while (Date.now() < killDeadline) {
    const survivors = capture();
    if (survivors.length === 0) return true;
    for (const entry of survivors.reverse()) signal(entry.pid, 'SIGKILL');
    await delay(50);
  }
  return false;
}

/**
 * Execute a fixed argument vector and await owned descendant cleanup on timeout.
 * Linux and macOS are supported; other platforms fail before starting any process.
 * No stdout, process arguments or raw infrastructure errors enter the result.
 * @param command - Executable, arguments and execution deadline in milliseconds.
 * @param cwd - Repository working directory for the fixed command.
 * @returns Exit status or infrastructure classification after bounded cleanup.
 */
export function runProcess(command, cwd) {
  if (!['linux', 'darwin'].includes(process.platform))
    return Promise.resolve({ error: 'unsupported-platform' });
  // Fail before execution when process ownership cannot be inspected safely.
  try {
    snapshot();
  } catch {
    return Promise.resolve({ error: 'process-inspection-unavailable' });
  }
  return new Promise((complete) => {
    const child = spawn(command.file, command.args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        NX_DAEMON: 'false',
        NX_ISOLATE_PLUGINS: 'false',
        NX_NO_CLOUD: 'true',
      },
    });
    let timedOut = false;
    const timer = setTimeout(async () => {
      timedOut = true;
      let cleaned = false;
      try {
        cleaned = await cleanOwnedTree(child.pid);
      } catch {
        // Best effort for the directly owned group if inspection becomes unavailable.
        try {
          signal(-child.pid, 'SIGKILL');
        } catch {
          /* Report cleanup failure. */
        }
      }
      complete({
        timedOut: true,
        ...(cleaned ? {} : { error: 'cleanup-error' }),
      });
    }, command.timeoutMs);
    child.once('error', () => {
      clearTimeout(timer);
      complete({ error: 'spawn-error' });
    });
    child.once('close', (exitCode, terminated) => {
      if (timedOut) return; // Parent close cannot prove detached descendants exited.
      clearTimeout(timer);
      complete(terminated ? { error: 'signal' } : { exitCode });
    });
  });
}
