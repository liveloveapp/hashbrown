import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL(
  '../../.github/workflows/pr-main.yml',
  import.meta.url,
);
const workflowDirectoryPath = new URL(
  '../../.github/workflows/',
  import.meta.url,
);
const actionUsePattern =
  /^\s*(?:-\s*)?uses:\s*(['"]?)(actions\/(?:checkout|setup-node))@([^\s#'"]+)\1\s*(?:#.*)?$/i;
const blockScalarPattern =
  /^\s*(?:-\s*)?[^#\s][^:]*:\s*[>|](?:[1-9][+-]?|[+-][1-9]?)?\s*(?:#.*)?$/;

function findActionReferences(path, contents) {
  const references = [];
  let blockScalarIndent;

  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const indentation = line.length - line.trimStart().length;

    if (blockScalarIndent !== undefined) {
      if (line.trim() === '' || indentation > blockScalarIndent) {
        continue;
      }

      blockScalarIndent = undefined;
    }

    if (blockScalarPattern.test(line)) {
      blockScalarIndent = indentation;
      continue;
    }

    const match = actionUsePattern.exec(line);
    if (match) {
      const [, , matchedAction, version] = match;

      references.push({
        path,
        lineNumber: index + 1,
        reference: `${matchedAction}@${version}`,
        action: matchedAction.toLowerCase(),
        version,
      });
    }
  }

  return references;
}

test('allows production deployment from a main push or manual dispatch', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(
    workflow,
    /cloudflare-production:[\s\S]*?if: >-\n\s+\(github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\) \|\|\n\s+github\.event_name == 'workflow_dispatch'/,
  );
});

test('requires actions/checkout and actions/setup-node references to use v7', async () => {
  const workflowEntries = await readdir(workflowDirectoryPath, {
    withFileTypes: true,
  });
  const workflowPaths = workflowEntries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => new URL(entry.name, workflowDirectoryPath));
  const workflows = await Promise.all(
    workflowPaths.map(async (path) => ({
      path,
      contents: await readFile(path, 'utf8'),
    })),
  );

  const actionReferences = workflows.flatMap(({ path, contents }) =>
    findActionReferences(path, contents),
  );

  assert.ok(
    actionReferences.length > 0,
    'expected at least one actions/checkout or actions/setup-node reference',
  );
  for (const {
    path,
    lineNumber,
    reference,
    action,
    version,
  } of actionReferences) {
    assert.equal(
      version,
      'v7',
      `${path.pathname}:${lineNumber}: ${reference} must use ${action}@v7`,
    );
  }
});
