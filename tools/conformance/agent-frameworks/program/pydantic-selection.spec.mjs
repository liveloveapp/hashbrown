import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const base = 'tools/conformance/agent-frameworks';
const project = 'pydantic-ai-conformance';
const taskGraph = (path) => {
  const directory = mkdtempSync(join(tmpdir(), 'pydantic-selection-'));
  try {
    const output = join(directory, 'tasks.json');
    execFileSync(
      'npx',
      [
        'nx',
        'affected',
        `--files=${path}`,
        '--targets=lint,test,build,example-e2e',
        `--graph=${output}`,
      ],
      {
        env: {
          ...process.env,
          NX_DAEMON: 'false',
          NX_ISOLATE_PLUGINS: 'false',
          NX_NO_CLOUD: 'true',
        },
        timeout: 120000,
        stdio: 'pipe',
      },
    );
    return JSON.parse(readFileSync(output, 'utf8'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const graph = (path) => Object.keys(taskGraph(path).tasks.tasks);

for (const path of [
  `${base}/python/host.py`,
  `${base}/python/uv.lock`,
  `${base}/python/.python-version`,
  'packages/core/src/index.ts',
  'packages/react/src/index.ts',
  'packages/angular/src/index.ts',
  'tools/conformance/harness/app-driver.ts',
  `${base}/program/catalog.json`,
  'tools/conformance/harness/ci-selection.ts',
  '.github/workflows/pr-main.yml',
  '.github/workflows/framework-compatibility.yml',
  `${base}/python/evidence/text.sse`,
  `${base}/python/evidence/text.events.json`,
  `${base}/python/evidence/server-tool.execution.json`,
  `${base}/python/evidence/client-tool.request.json`,
  `${base}/python/evidence/streaming.live.json`,
  `${base}/python/controller.d.mts`,
  'packages/core/src/models/pydantic-ai.conformance.spec.ts',
]) {
  test(`real task graph selects all Pydantic gates for ${path}`, () => {
    const tasks = graph(path);

    for (const target of [
      'install',
      'build',
      'test',
      'consumer-test',
      'example-e2e',
    ])
      assert.ok(
        tasks.includes(`${project}:${target}`),
        `Missing ${project}:${target}`,
      );
    for (const consumer of ['runtime-smoke-angular', 'runtime-smoke-react'])
      assert.ok(
        tasks.some(
          (id) =>
            id === `${consumer}:build` || id.startsWith(`${consumer}:build:`),
        ),
      );
  });
}

for (const path of [
  `${base}/program/pydantic-qualification.json`,
  `${base}/python/evidence/qualification-summary.json`,
  'www/content/docs/react/platform/compatibility.md',
  'www/content/docs/react/getting-started/installation.md',
]) {
  test(`real task graph keeps ${path} free of Python installation`, () => {
    const tasks = graph(path);

    assert.ok(!tasks.includes(`${project}:install`));
    assert.ok(!tasks.includes(`${project}:test`));
    if (path.includes('qualification')) {
      assert.ok(tasks.includes('framework-conformance-program:test'));
      assert.ok(tasks.includes('framework-conformance-program:build'));
    }
  });
}

test('Python cache inputs bind runtime, lock, captures, consumer and CI sources', () => {
  const config = JSON.parse(
    readFileSync(`${base}/python/project.json`, 'utf8'),
  );

  assert.ok(
    !config.implicitDependencies.includes('framework-conformance-program'),
  );
  assert.ok(config.targets.test.dependsOn.includes('install'));
  assert.ok(!config.targets.lint.dependsOn?.includes('install'));
  assert.match(config.targets.install.options.command, /uv sync --frozen/);
  assert.match(
    config.targets['consumer-test'].options.command,
    /pydantic-ai.conformance.spec.ts/,
  );
});

test('actual project graph keeps core, consumers and Node conformance independent of Python', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pydantic-dependencies-'));

  try {
    const output = join(directory, 'projects.json');
    execFileSync('npx', ['nx', 'graph', `--file=${output}`], {
      env: {
        ...process.env,
        NX_DAEMON: 'false',
        NX_ISOLATE_PLUGINS: 'false',
        NX_NO_CLOUD: 'true',
      },
      timeout: 120000,
      stdio: 'pipe',
    });
    const dependencies = JSON.parse(readFileSync(output, 'utf8')).graph
      .dependencies;

    for (const consumer of ['core', 'angular', 'react', 'conformance'])
      assert.ok(
        dependencies[consumer].every(({ target }) => target !== project),
        `${consumer} must not depend on Python`,
      );
    assert.ok(
      dependencies[project].some(({ target }) => target === 'conformance'),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('nested prepared-store execution bypasses the inner Nx cache', () => {
  const config = JSON.parse(
    readFileSync(`${base}/python/project.json`, 'utf8'),
  );

  assert.match(
    config.targets['consumer-test'].options.command,
    /--skip-nx-cache(?:\s|$)/,
  );
});

for (const extension of ['sse', 'request.json']) {
  test(`core test hashing and affected graph include retained Python ${extension} inputs`, () => {
    const path = `${base}/python/evidence/streaming.${extension}`;

    const result = taskGraph(path);

    assert.ok(
      result.tasks.tasks['core:test'],
      'Retained consumer evidence must select core:test',
    );
    assert.ok(
      result.taskPlans['core:test'].some((input) =>
        input.includes(`${base}/python/evidence/*.${extension}`),
      ),
      'Native Nx hash plan must include the retained evidence glob',
    );
    assert.ok(
      result.graph.dependencies.core.every(({ target }) => target !== project),
    );
  });
}
