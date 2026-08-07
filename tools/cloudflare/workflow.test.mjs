import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL(
  '../../.github/workflows/pr-main.yml',
  import.meta.url,
);
const workflowPaths = [
  workflowPath,
  new URL('../../.github/workflows/npm-publish.yml', import.meta.url),
  new URL('../../.github/workflows/nightly.yml', import.meta.url),
];

test('allows production deployment from a main push or manual dispatch', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(
    workflow,
    /cloudflare-production:[\s\S]*?if: >-\n\s+\(github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\) \|\|\n\s+github\.event_name == 'workflow_dispatch'/,
  );
});

test('uses Node 24 action runtimes in every workflow', async () => {
  const workflows = await Promise.all(
    workflowPaths.map(async (path) => ({
      path,
      contents: await readFile(path, 'utf8'),
    })),
  );

  const actionReferences = workflows.flatMap(({ path, contents }) =>
    [...contents.matchAll(/actions\/(checkout|setup-node)@([^\s#]+)/g)].map(
      ([reference, action, version]) => ({ path, reference, action, version }),
    ),
  );

  assert.ok(actionReferences.length > 0);
  for (const { path, reference, action, version } of actionReferences) {
    assert.equal(
      version,
      'v7',
      `${path.pathname}: ${reference} must use actions/${action}@v7`,
    );
  }
});
