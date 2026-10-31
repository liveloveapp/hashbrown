import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const program = 'framework-conformance-program';
const base = 'tools/conformance/agent-frameworks';
const environment = {
  ...process.env,
  NX_DAEMON: 'false',
  NX_ISOLATE_PLUGINS: 'false',
  NX_NO_CLOUD: 'true',
};
const nx = (args) =>
  execFileSync('npx', ['nx', ...args], {
    env: environment,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 10000000,
  });
const affected = (path) =>
  JSON.parse(
    nx(['show', 'projects', '--affected', `--files=${path}`, '--json']),
  );
const graph = (path, targets = 'test,build,example-e2e') => {
  const folder = mkdtempSync(join(tmpdir(), 'framework-selection-'));
  try {
    const output = join(folder, 'tasks.json');
    nx([
      'affected',
      `--files=${path}`,
      `--targets=${targets}`,
      `--graph=${output}`,
    ]);
    return Object.keys(JSON.parse(readFileSync(output, 'utf8')).tasks.tasks);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
};

for (const path of [
  'packages/core/src/index.ts',
  'packages/angular/src/index.ts',
  'packages/react/src/index.ts',
  'tools/conformance/harness/app-driver.ts',
  `${base}/node/langgraph.mjs`,
  `${base}/node/package-lock.json`,
  `${base}/recipes/future/adapter.mjs`,
]) {
  test(`real Nx selection preserves framework gates for ${path}`, () => {
    const projects = affected(path);

    const tasks = graph(path);

    assert.ok(projects.includes('conformance'));
    assert.ok(projects.includes(program));
    assert.ok(tasks.includes('conformance:agent-framework-install'));
    assert.ok(tasks.includes('conformance:agent-framework-test'));
    assert.ok(tasks.includes('conformance:example-e2e'));
    assert.ok(
      tasks.some(
        (id) =>
          id === 'runtime-smoke-angular:build' ||
          id.startsWith('runtime-smoke-angular:build:'),
      ),
    );
    assert.ok(
      tasks.some(
        (id) =>
          id === 'runtime-smoke-react:build' ||
          id.startsWith('runtime-smoke-react:build:'),
      ),
    );
    if (path.startsWith('packages/core/'))
      assert.ok(tasks.includes('core:test'));
  });
}

for (const path of [
  `${base}/program/report.mjs`,
  `${base}/program/qualification.json`,
  'www/content/docs/react/platform/compatibility.md',
  'www/project.json',
]) {
  test(`real Nx selects documentation checks without framework installation for ${path}`, () => {
    const projects = affected(path);

    const tasks = graph(
      path,
      'lint,test,typecheck,build,e2e,install-pack-e2e,example-e2e',
    );

    assert.ok(projects.includes(program));
    assert.ok(projects.includes('www'));
    assert.ok(!projects.includes('conformance'));
    assert.ok(tasks.includes(`${program}:build`));
    assert.ok(!tasks.includes('conformance:agent-framework-install'));
  });
}

test('raw captures select evidence validation and real consumer gates', () => {
  const path =
    'packages/core/src/models/fixtures/agent-frameworks/langgraph-server-tool.json';

  const projects = affected(path);
  const tasks = graph(path);

  assert.ok(projects.includes(program));
  assert.ok(projects.includes('www'));
  assert.ok(tasks.includes('core:test'));
  assert.ok(tasks.includes('conformance:agent-framework-test'));
});

test('unrelated documentation does not install framework hosts', () => {
  const path = 'www/content/docs/react/getting-started/installation.md';

  const tasks = graph(path);

  assert.ok(!tasks.includes('conformance:agent-framework-install'));
});

test('website production build isolates its environment from grouped Nx test execution', () => {
  const website = JSON.parse(readFileSync('www/project.json', 'utf8'));

  const buildEnvironment = website.targets.build.options.env;
  const testEnvironment = website.targets.test.options.env;

  assert.equal(buildEnvironment?.NODE_ENV, 'production');
  assert.notEqual(testEnvironment?.NODE_ENV, 'production');
});
