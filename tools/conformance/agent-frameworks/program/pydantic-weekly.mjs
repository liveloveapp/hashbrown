import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const fixture = resolve(root, 'tools/conformance/agent-frameworks/python');
const defaultOutput = resolve(root, 'test-results/pydantic-compatibility');
const pins = Object.freeze({
  python: '3.12.12',
  uv: '0.11.3',
  'pydantic-ai-slim': '2.64.0',
  'ag-ui-protocol': '1.0.0',
  starlette: '1.10.0',
  uvicorn: '0.54.0',
});
const commands = [
  { id: 'producer-and-capture', target: 'test', timeoutMs: 900000 },
  {
    id: 'canonical-consumer-and-next-request',
    target: 'consumer-test',
    timeoutMs: 600000,
  },
  { id: 'react-and-angular-browser', target: 'example-e2e', timeoutMs: 900000 },
].map(({ target, ...command }) => ({
  ...command,
  file: 'npx',
  args: ['nx', target, 'pydantic-ai-conformance', '--skip-nx-cache'],
}));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const loadMetadata = async () => {
  const files = (await readdir(fixture))
    .filter(
      (name) =>
        /\.(py|mjs|mts)$/.test(name) ||
        [
          'uv.lock',
          'pyproject.toml',
          '.python-version',
          'project.json',
        ].includes(name),
    )
    .sort();
  const sources = await Promise.all(
    files.map(async (name) => [name, await readFile(resolve(fixture, name))]),
  );
  const hashes = Object.fromEntries(
    sources.map(([name, value]) => [name, sha256(value)]),
  );
  const version = await readFile(resolve(fixture, '.python-version'), 'utf8');
  if (version.trim() !== pins.python) throw new Error('runtime pin mismatch');
  const manifest = await readFile(resolve(fixture, 'pyproject.toml'), 'utf8');
  for (const name of [
    'pydantic-ai-slim',
    'ag-ui-protocol',
    'starlette',
    'uvicorn',
  ]) {
    const dependency = name === 'pydantic-ai-slim' ? `${name}[ag-ui]` : name;
    if (!manifest.includes(`"${dependency}==${pins[name]}"`))
      throw new Error('dependency pin mismatch');
  }
  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim(),
    pins: { ...pins },
    hashes,
  };
};

const render = (health) =>
  [
    '# Pydantic AI compatibility baseline attempt',
    '',
    `Status: **${health.status}**`,
    '',
    `Commit: \`${health.baseline?.commit ?? 'unavailable'}\``,
    '',
    '| Command ID | Attempt status | Exit code |',
    '| --- | --- | --- |',
    ...health.stages.map(
      (stage) => `| ${stage.id} | ${stage.status} | ${stage.exitCode ?? '—'} |`,
    ),
    '',
    `Candidate: **${health.candidate.status}** — ${health.candidate.reason}`,
    '',
    'Only approved exact pins are eligible. Historical qualification remains unchanged.',
    '',
  ].join('\n');

const writeHealth = async (health, output) => {
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
    await writeFile(resolve(destination, 'health.md'), render(health));
  }
  return { exitCode: health.status === 'passed' ? 0 : 1 };
};

/**
 * Retain independent Python health after setup failure without importing a framework.
 * @param options - Optional directory for sanitized attempt and latest artifacts.
 * @returns A nonzero exit code so infrastructure failure cannot report success.
 */
export async function writeNotRunHealth({ output = defaultOutput } = {}) {
  const now = new Date().toISOString();
  return writeHealth(
    {
      schemaVersion: 1,
      startedAt: now,
      completedAt: now,
      status: 'infrastructure-error',
      qualification: 'unchanged',
      baseline: null,
      stages: commands.map(({ id }) => ({
        id,
        status: 'not-run',
        reason: 'infrastructure-setup-error',
      })),
      candidate: {
        status: 'not-run',
        reason: 'Baseline setup did not complete.',
      },
    },
    output,
  );
}

/**
 * Attempt every approved Python gate with bounded process ownership and exact pins.
 * Raw process output, exceptions and environment values never enter health artifacts.
 * The candidate has identical reviewed pins and is explicitly deduplicated.
 * @param options - Artifact directory and optional process and metadata adapters.
 * @returns Independent attempt exit code, without updating qualification records.
 */
export async function runBaseline({
  output = defaultOutput,
  runner = (command) => runProcess(command, root),
  metadataLoader = loadMetadata,
} = {}) {
  const startedAt = new Date().toISOString();
  let baseline;
  try {
    baseline = await metadataLoader();
  } catch {
    return writeNotRunHealth({ output });
  }
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
  return writeHealth(
    {
      schemaVersion: 1,
      startedAt,
      completedAt: new Date().toISOString(),
      baseline,
      stages,
      status: stages.every(({ status }) => status === 'passed')
        ? 'passed'
        : 'failed',
      qualification: 'unchanged',
      candidate: {
        status: 'deduplicated',
        reason:
          'The approved candidate exact pins equal the baseline; no second execution or upgrade is claimed.',
        pins: { ...baseline.pins },
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
    console.error(
      'Usage: pydantic-weekly.mjs [--not-run] [--output directory]',
    );
    process.exitCode = 2;
  } else {
    const result = await (notRun ? writeNotRunHealth : runBaseline)(
      options.length ? { output: resolve(options[1]) } : {},
    );
    process.exitCode = result.exitCode;
  }
}
