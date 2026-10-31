import { execFileSync } from 'node:child_process';
import { runProcess as executeProcess } from './process.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadInventory } from './inventory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const commands = [
  {
    id: 'producer-and-capture',
    file: 'npx',
    args: ['nx', 'agent-framework-test', 'conformance', '--skip-nx-cache'],
    timeoutMs: 15 * 60000,
  },
  {
    id: 'canonical-consumer-and-next-request',
    file: 'npx',
    args: [
      'nx',
      'test',
      'core',
      '--testFile=agent-framework-display.conformance.spec.ts',
      '--runInBand',
      '--passWithNoTests=false',
      '--skip-nx-cache',
    ],
    timeoutMs: 10 * 60000,
  },
  {
    id: 'react-and-angular-browser',
    file: 'npx',
    args: ['nx', 'agent-framework-e2e', 'conformance', '--skip-nx-cache'],
    timeoutMs: 15 * 60000,
  },
];

/**
 * Execute an argument-vector command with a bounded lifetime and no shell.
 * Output is omitted to keep fixture/process diagnostics out of retained health reports.
 * @param command - Executable, arguments and timeout in milliseconds.
 * @returns Exit code, timeout marker or sanitized spawn error classification.
 */
export function runProcess(command) {
  return executeProcess(command, root);
}

const renderHealth = (health) =>
  [
    '# Framework compatibility baseline attempt',
    '',
    `Status: **${health.status}**`,
    '',
    `Commit: \`${health.commit}\``,
    `Runtime: Node ${health.runtime.node}; ${health.runtime.platform}/${health.runtime.arch}`,
    '',
    health.profiles.length === 7
      ? 'Only the seven approved Node profiles were eligible. Historical qualifications remain unchanged.'
      : 'Baseline execution did not start. No profile execution or qualification is claimed.',
    '',
    '| Command ID | Attempt status | Exit code |',
    '| --- | --- | --- |',
    ...health.stages.map(
      (stage) => `| ${stage.id} | ${stage.status} | ${stage.exitCode ?? '—'} |`,
    ),
    '',
    '## Exact approved profile pins',
    '',
    ...health.profiles.map(
      (profile) =>
        `- \`${profile.id}\`: ${Object.entries(profile.versions)
          .map(([name, version]) => `\`${name}@${version}\``)
          .join(', ')}`,
    ),
    '',
    `Candidate: **${health.candidate.status}** — ${health.candidate.reason}`,
    '',
  ].join('\n');

/**
 * Attempt every approved baseline stage and retain independent health artifacts.
 * Frameworks execute only through the fixed Nx commands; inventory loading is data-only.
 * @param options - Output directory and optional process/inventory adapters for tests.
 * @returns Overall nonzero exit status when any stage fails or cannot execute.
 */
export async function runBaseline({
  output = resolve(root, 'test-results/framework-compatibility'),
  runner = runProcess,
  inventoryLoader = loadInventory,
} = {}) {
  const startedAt = new Date().toISOString();
  let commit;
  let inventory;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    inventory = await inventoryLoader();
  } catch {
    return writeNotRunHealth({ output });
  }
  const profiles = inventory.profiles
    .filter((profile) => profile.qualification)
    .map(({ id, versions }) => ({ id, versions }));
  const stages = [];
  for (const command of commands) {
    let result;
    try {
      result = await runner(structuredClone(command));
    } catch {
      result = { error: 'runner-error' };
    }
    const infrastructure =
      result?.timedOut || result?.error || !Number.isInteger(result?.exitCode);
    stages.push({
      id: command.id,
      status: infrastructure
        ? 'infrastructure-error'
        : result.exitCode === 0
          ? 'passed'
          : 'failed',
      ...(Number.isInteger(result?.exitCode)
        ? { exitCode: result.exitCode }
        : {}),
      ...(infrastructure
        ? { reason: result?.timedOut ? 'timeout' : 'process-error' }
        : {}),
    });
  }
  const health = {
    schemaVersion: 1,
    startedAt,
    completedAt: new Date().toISOString(),
    commit,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    profiles,
    stages,
    status: stages.every((stage) => stage.status === 'passed')
      ? 'passed'
      : 'failed',
    candidate: {
      status: 'not-run',
      reason:
        'Only exact pins are approved; dependency and runtime ranges require approval.',
    },
  };
  return writeHealth(health, output);
}

/**
 * Preserve a timestamped attempt and update the latest sanitized health artifacts.
 * @param health - Detached attempt health without process output or environment values.
 * @param output - Directory containing retained attempts and latest summary.
 * @returns A process exit status derived from this attempt alone.
 */
const writeHealth = async (health, output) => {
  // Separate attempt files preserve failures even when a later invocation succeeds.
  const attempt = resolve(
    output,
    `attempt-${health.startedAt.replace(/[:.]/g, '-')}-${process.pid}`,
  );
  for (const destination of [attempt, output]) {
    await mkdir(destination, { recursive: true });
    await writeFile(
      resolve(destination, 'health.json'),
      `${JSON.stringify(health, null, 2)}\n`,
    );
    await writeFile(resolve(destination, 'health.md'), renderHealth(health));
  }
  return { exitCode: health.status === 'passed' ? 0 : 1 };
};

/**
 * Retain sanitized infrastructure health when setup prevented any baseline execution.
 * Requires no inventory validation, installed frameworks or workspace dependencies.
 * @param options - Optional health output directory.
 * @returns A nonzero exit status so setup failure cannot become a passing attempt.
 */
export async function writeNotRunHealth({
  output = resolve(root, 'test-results/framework-compatibility'),
} = {}) {
  let commit = 'unavailable';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    /* Git itself may be unavailable during infrastructure failure. */
  }
  const now = new Date().toISOString();
  return writeHealth(
    {
      schemaVersion: 1,
      startedAt: now,
      completedAt: now,
      commit,
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      profiles: [],
      stages: commands.map(({ id }) => ({
        id,
        status: 'not-run',
        reason: 'infrastructure-setup-error',
      })),
      status: 'infrastructure-error',
      candidate: {
        status: 'not-run',
        reason:
          'Only exact pins are approved; dependency and runtime ranges require approval.',
      },
    },
    output,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const notRun = args[0] === '--not-run';
  const options = notRun ? args.slice(1) : args;
  if (!(
    options.length === 0 ||
    (options.length === 2 &&
      options[0] === '--output' &&
      !options[1].startsWith('--'))
  )) {
    console.error('Usage: weekly.mjs [--not-run] [--output directory]');
    process.exitCode = 2;
  } else {
    const result = await (notRun ? writeNotRunHealth : runBaseline)(
      options.length ? { output: resolve(options[1]) } : {},
    );
    process.exitCode = result.exitCode;
  }
}
