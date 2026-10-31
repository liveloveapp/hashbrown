import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCommittedExecution, isSourcePath } from './qualify.mjs';

test('qualification binds maintained assertions and package sources while excluding historical data and unrelated implementation', () => {
  const inputs = [
    'packages/pydantic-ai/src/hashbrown_pydantic_ai/adapter.py',
    'tools/conformance/agent-frameworks/python-recipe/install.mjs',
    'tools/conformance/hosts/angular/src/app/terminal-tool-smoke.ts',
    'packages/core/src/models/pydantic-recipe.conformance.spec.ts',
  ];
  const historical = [
    'tools/conformance/agent-frameworks/python-recipe/evidence/qualification-stages.json',
    'packages/core/src/reducers/unrelated.reducer.ts',
    'docs/unrelated.md',
  ];

  const tracked = inputs.map(isSourcePath);
  const excluded = historical.map(isSourcePath);

  assert.deepEqual(
    tracked,
    inputs.map(() => true),
  );
  assert.deepEqual(
    excluded,
    historical.map(() => false),
  );
});

test('dirty or untracked runtime implementation cannot be attributed to a committed source revision', () => {
  const implementation = 'packages/core/src/reducers/ag-ui-messages.reducer.ts';

  assert.equal(isSourcePath(implementation), false);
  assert.throws(
    () => assertCommittedExecution([implementation], []),
    /Uncommitted executable/,
  );
  assert.throws(
    () =>
      assertCommittedExecution(
        [],
        ['packages/angular/src/resources/new-helper.ts'],
      ),
    /Uncommitted executable/,
  );
  assert.doesNotThrow(() =>
    assertCommittedExecution(
      [
        'packages/core/src/models/fixtures/pydantic-recipe/server-tool.sse',
        'www/content/docs/react/platform/compatibility.md',
        'tools/conformance/agent-frameworks/program/pydantic-qualification.json',
      ],
      [],
    ),
  );
});
