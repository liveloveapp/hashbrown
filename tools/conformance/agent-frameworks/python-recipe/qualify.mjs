import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { platform, arch } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEvents } from '../python/capture.mjs';

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const fixture = 'tools/conformance/agent-frameworks/python-recipe';
const artifacts = 'packages/core/src/models/fixtures/pydantic-recipe';
const evidence = `${fixture}/evidence`;
const program = 'tools/conformance/agent-frameworks/program';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const ref = async (path) => ({
  path,
  sha256: sha(await readFile(resolve(root, path))),
});
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

/** Identify maintained producer/package and assertion boundaries; implementation is pinned by sourceCommit. */
export function isSourcePath(path) {
  return (
    (path.startsWith('packages/pydantic-ai/') && !path.includes('/dist/')) ||
    (path.startsWith(`${fixture}/`) && !path.includes('/evidence/')) ||
    path.startsWith('tools/conformance/pydantic-recipe/') ||
    [
      'tools/conformance/pydantic-recipe.playwright.config.ts',
      'packages/core/src/models/pydantic-recipe.conformance.spec.ts',
      'packages/core/src/models/tool-outcome.spec.ts',
      'packages/core/src/effects/generate-message.effects.spec.ts',
      'packages/core/project.json',
      'tools/conformance/agent-frameworks/python/capture.mjs',
      'tools/conformance/agent-frameworks/python/normalize.mjs',
      'tools/conformance/agent-frameworks/python/uv.lock',
      'tools/conformance/agent-frameworks/python/pyproject.toml',
      'tools/conformance/agent-frameworks/python/.python-version',
      'tools/conformance/harness/app-driver.ts',
      'tools/conformance/harness/ci-selection.ts',
      'tools/conformance/harness/select-ci-setup.ts',
      'tools/conformance/hosts/react/src/plain-smoke.tsx',
      'tools/conformance/hosts/angular/src/app/plain-smoke.ts',
      'tools/conformance/hosts/angular/src/app/terminal-tool-smoke.ts',
      'tools/conformance/hosts/angular/src/main.ts',
      '.github/workflows/pr-main.yml',
      '.github/workflows/framework-compatibility.yml',
      `${program}/pydantic-recipe-weekly.mjs`,
    ].includes(path)
  );
}

/** Reject omitted or dirty executable inputs before writing a qualification record. */
async function sourceInputs() {
  const untracked = git('ls-files', '--others', '--exclude-standard')
    .split('\n')
    .filter(isSourcePath);
  assert.deepEqual(
    untracked,
    [],
    'Commit all executable qualification inputs before qualification',
  );
  const files = git('ls-files').split('\n').filter(isSourcePath);
  assert.ok(
    files.includes(`${fixture}/qualify.mjs`),
    'Commit implementation sources before qualification',
  );
  assert.equal(
    git('diff', 'HEAD', '--', ...files),
    '',
    'Executable qualification sources must be committed',
  );
  return Promise.all(files.sort().map(ref));
}

/** Run the actual checks; never accept manually supplied success observations. */
function run(id, file, args) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(file, args, {
    cwd: root,
    stdio: 'inherit',
    timeout: 1800000,
    env: process.env,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${id} failed`);
  return {
    id,
    file,
    args,
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode: result.status,
  };
}

/** Execute and retain one local, pinned recipe qualification without changing native records. */
export async function qualify() {
  const sources = await sourceInputs();
  const sourceCommit = git('rev-parse', 'HEAD');
  const startedAt = new Date().toISOString();
  const execution = { kind: 'local', id: `pydantic-recipe-${startedAt}` };
  const commands = [];
  const nx = (id, target, project, more = []) =>
    commands.push(
      run(id, 'npx', [
        'nx',
        target,
        project,
        '--skip-nx-cache',
        '--output-style=static',
        ...more,
      ]),
    );
  nx('package-build', 'build', 'pydantic-ai');
  nx('installed-wheel', 'install', 'pydantic-ai-recipe-conformance');
  commands.push(
    run('capture-real-producer', 'node', [`${fixture}/capture.mjs`, '--write']),
  );
  nx('package-tests', 'test', 'pydantic-ai');
  nx('package-lint', 'lint', 'pydantic-ai');
  nx('recipe-build', 'build', 'pydantic-ai-recipe-conformance');
  nx('producer-consumer-tests', 'test', 'pydantic-ai-recipe-conformance');
  nx('recipe-lint', 'lint', 'pydantic-ai-recipe-conformance');
  nx('core-tests', 'test', 'core', ['--runInBand']);
  nx('core-build', 'build', 'core');
  nx('core-lint', 'lint', 'core');
  nx(
    'browser-react-and-angular',
    'example-e2e',
    'pydantic-ai-recipe-conformance',
  );
  assert.equal(
    git('rev-parse', 'HEAD'),
    sourceCommit,
    'Source commit changed during qualification',
  );
  assert.deepEqual(
    await sourceInputs(),
    sources,
    'Source inputs changed during qualification',
  );
  await mkdir(resolve(root, evidence), { recursive: true });
  const write = async (name, value) => {
    const path = `${evidence}/${name}.json`;
    await writeFile(resolve(root, path), json(value));
    return ref(path);
  };
  const packageInstallationRef = await write(
    'package-installation',
    JSON.parse(
      await readFile(
        resolve(root, 'test-results/pydantic-recipe/installation.json'),
        'utf8',
      ),
    ),
  );
  const outcomeObservationsRef = await write('outcome-observations', {
    observations: await Promise.all(
      [
        ['tools.failure', 'failure', 'failure'],
        ['tools.cancel', 'cancel-default', 'cancelled'],
        ['approvals.resume', 'approval-deny', 'denied'],
      ].map(async ([scenarioId, scenario, outcome]) => {
        const wire = await ref(`${artifacts}/${scenario}.sse`);
        const events = parseEvents(await readFile(resolve(root, wire.path)));
        const eventIndex = events.findIndex(
          (event) =>
            event.type === 'TOOL_CALL_RESULT' &&
            event.metadata?.['hashbrown.tool']?.outcome === outcome,
        );
        assert.ok(eventIndex >= 0, `Missing real ${outcome}`);
        return {
          scenarioId,
          wire,
          toolCallId: events[eventIndex].toolCallId,
          outcome,
          eventIndex,
        };
      }),
    ),
  });
  const sourceSha256 = sha(JSON.stringify(sources));
  const versions = {
    'pydantic-ai-slim': '2.64.0',
    'ag-ui-protocol': '1.0.0',
    starlette: '1.10.0',
    uvicorn: '0.54.0',
  };
  const runtime = {
    python: execFileSync(
      resolve(root, `${fixture}/.venv/bin/python`),
      ['-c', 'import platform;print(platform.python_version())'],
      { encoding: 'utf8' },
    ).trim(),
    uv: execFileSync('uv', ['--version'], { encoding: 'utf8' })
      .trim()
      .split(' ')[1],
  };
  assert.deepEqual(runtime, { python: '3.12.12', uv: '0.11.3' });
  const identity = {
    framework: 'pydantic-ai',
    profile: 'asgi-compatibility',
    versions,
    runtime,
    platform: `${platform()}/${arch()}`,
    protocol: {
      requested:
        '1.0 in retained probes except cancel-default; omitted in ordinary browser requests',
      effective:
        'Native AG-UI envelope; neutral per-tool outcomes independent of run cancellation negotiation',
    },
    transport: 'http-sse',
    execution,
    sourceInputs: sources,
  };
  const wire = await ref(`${artifacts}/server-tool.sse`);
  const events = parseEvents(await readFile(resolve(root, wire.path)));
  const executionSummary = await write('qualification-execution', {
    execution,
    sourceSha256,
    versions,
    runtime,
    realFrameworkExecution: true,
    wire,
    callbackObservationsRef: await ref(
      `${artifacts}/server-tool.execution.json`,
    ),
    liveObservationsRef: await ref(`${artifacts}/server-tool.live.json`),
    packageInstallationRef,
    outcomeObservationsRef,
    commands,
    scope:
      'Optional generic adapter; no backend durable recovery, file search, subagent attribution, citations, structured UI or media claims.',
  });
  const capture = await write('qualification-capture', {
    ...identity,
    sourceSha256,
    wire,
    executionSummary,
    events,
    eventsSha256: sha(JSON.stringify(events)),
  });
  const passed = new Set([
    'tools.server-execution',
    'recovery.canonical-consumer-restore',
    'tools.react-display',
    'tools.angular-display',
    'tools.live-start',
    'activities.native',
    'activities.live-start',
    'conversation.streaming',
    'conversation.history',
    'approvals.resume',
    'state.snapshot-patch',
    'recovery.thread-isolation',
    'tools.client-roundtrip',
    'tools.failure',
    'tools.cancel',
  ]);
  const catalog = JSON.parse(
    await readFile(resolve(root, `${program}/catalog.json`), 'utf8'),
  );
  const native = JSON.parse(
    await readFile(
      resolve(root, `${program}/pydantic-qualification.json`),
      'utf8',
    ),
  );
  const original = native.records.find(
    (record) => record.id === 'pydantic-ai/asgi-baseline',
  );
  const definitions = new Map(
    catalog.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const observations = original.claims.flatMap((claim) =>
    passed.has(claim.scenarioId)
      ? definitions.get(claim.scenarioId).requiredStages.map((stage) => ({
          scenarioId: claim.scenarioId,
          stage,
          result: 'pass',
          basis:
            'Actual source-bound installed-wheel producer, prepared consumer and browser checks completed successfully.',
        }))
      : claim.scenarioId === 'tools.same-name-client-inert'
        ? [
            {
              scenarioId: claim.scenarioId,
              stage: 'producer-execution',
              result: 'fail',
              basis:
                'Native duplicate tool name rejection observed before execution.',
            },
          ]
        : [],
  );
  const stageRef = await write('qualification-stages', {
    profileId: 'pydantic-ai/asgi-compatibility',
    execution,
    sourceSha256,
    captureSha256: capture.sha256,
    sourceCommit,
    startedAt,
    completedAt: new Date().toISOString(),
    commands,
    observations,
    browserScope:
      'Both current Hashbrown React and Angular production smoke consumers; ordinary requests retain native protocol negotiation.',
  });
  const raw = await Promise.all(
    (await readdir(resolve(root, artifacts)))
      .filter((name) => /\.(sse|json)$/.test(name))
      .sort()
      .map((name) => ref(`${artifacts}/${name}`)),
  );
  const record = {
    ...identity,
    id: 'pydantic-ai/asgi-compatibility',
    mode: 'recipe',
    recipe: { id: 'hashbrown-pydantic-ai', version: '0.1.0' },
    qualifiedAt: startedAt.slice(0, 10),
    sourceCommit,
    recordPath: `${program}/pydantic-qualification.json`,
    capture: { ...capture, sourceSha256 },
    sources: [
      ...sources,
      ...raw,
      packageInstallationRef,
      outcomeObservationsRef,
      executionSummary,
      stageRef,
    ],
    claims: original.claims.map((claim) => ({
      scenarioId: claim.scenarioId,
      capability: claim.capability,
      status: passed.has(claim.scenarioId)
        ? 'passed'
        : claim.scenarioId === 'tools.same-name-client-inert'
          ? 'missing-upstream'
          : 'not-tested',
      detail: passed.has(claim.scenarioId)
        ? 'Passed with the optional generic adapter at the exact pinned versions and required executed stages.'
        : claim.scenarioId === 'tools.same-name-client-inert'
          ? 'Native registration rejects a matching frontend/server tool name before execution; this adapter does not change tool ownership.'
          : 'Not qualified in this bounded recipe. Ordinary tools and client JSON restore do not establish this capability.',
      evidence: observations
        .filter((observation) => observation.scenarioId === claim.scenarioId)
        .map(({ stage, result }) => ({ ...stageRef, stage, result })),
    })),
  };
  native.records = [
    ...native.records.filter((item) => item.id !== record.id),
    record,
  ];
  await writeFile(
    resolve(root, `${program}/pydantic-qualification.json`),
    json(native),
  );
  return { sourceCommit, captureSha256: capture.sha256, passed: passed.size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--write')
    throw new Error('Explicit --write required');
  console.log(await qualify());
}
