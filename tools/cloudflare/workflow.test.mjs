import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL(
  '../../.github/workflows/pr-main.yml',
  import.meta.url,
);

test('allows production deployment from a main push or manual dispatch', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(
    workflow,
    /cloudflare-production:[\s\S]*?if: >-\n\s+\(github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\) \|\|\n\s+github\.event_name == 'workflow_dispatch'/,
  );
});
