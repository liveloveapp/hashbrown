import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const base = 'tools/conformance/agent-frameworks';
const project = 'pydantic-ai-recipe-conformance';
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
  'packages/pydantic-ai/src/hashbrown_pydantic_ai/adapter.py',
  'packages/pydantic-ai/pyproject.toml',
  `${base}/python-recipe/host.py`,
  'packages/core/src/models/fixtures/pydantic-recipe/server-tool.sse',
  'tools/conformance/pydantic-recipe/pydantic-recipe.spec.ts',
]) {
  test(`actual affected graph includes installed recipe gates for ${path}`, () => {
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
    assert.ok(tasks.includes('pydantic-ai:build'));
    assert.ok(tasks.includes('framework-conformance-program:test'));
  });
}

test('recipe qualification records do not select Python installation', () => {
  const tasks = graph(`${base}/program/pydantic-qualification.json`);

  assert.ok(!tasks.includes(`${project}:install`));
  assert.ok(!tasks.includes('pydantic-ai:build'));
});

test('recipe host cache binds package build sources, raw consumer captures and weekly runner', () => {
  const result = taskGraph(
    'packages/pydantic-ai/src/hashbrown_pydantic_ai/adapter.py',
  );
  const inputs = result.taskPlans[`${project}:test`];

  assert.ok(
    inputs.some((input) => input.includes('packages/pydantic-ai/**/*')),
  );
  assert.ok(
    inputs.some((input) =>
      input.includes('packages/core/src/models/fixtures/pydantic-recipe/**/*'),
    ),
  );
  for (const consumer of ['core', 'angular', 'react', 'conformance'])
    assert.ok(
      result.graph.dependencies[consumer].every(
        ({ target }) => target !== project && target !== 'pydantic-ai',
      ),
    );
});

test('unrelated provider changes do not select Python recipe installation', () => {
  const tasks = graph('packages/azure/src/index.ts');

  assert.ok(!tasks.includes(`${project}:install`));
  assert.ok(!tasks.includes('pydantic-ai:test'));
});
