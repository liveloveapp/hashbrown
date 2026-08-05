import assert from 'node:assert/strict';
import test from 'node:test';

import { PAGES_TARGETS, renderPreviewComment } from './deployment.mjs';
import { runPreviewDeployment } from './deploy.mjs';

const BASE_SHA = '1111111111111111111111111111111111111111';
const HEAD_SHA = 'abcdef123456abcdef123456abcdef123456abcd';
const NEW_HEAD_SHA = '2222222222222222222222222222222222222222';

test('validates injected targets before calling dependencies', async () => {
  const calls = [];
  const dependencies = {
    listAffectedProjects: async () => calls.push('affected'),
    listChangedFiles: async () => calls.push('changed'),
    buildTarget: async () => calls.push('build'),
    deployTarget: async () => calls.push('deploy'),
    getPullRequestHead: async () => calls.push('head'),
    findPreviewComment: async () => calls.push('find-comment'),
    createPreviewComment: async () => calls.push('create-comment'),
    updatePreviewComment: async () => calls.push('update-comment'),
    deletePreviewComment: async () => calls.push('delete-comment'),
    appendSummary: async () => calls.push('summary'),
  };
  const invalidTargets = [[], [{ ...PAGES_TARGETS[0], outputDirectory: '' }]];

  for (const targets of invalidTargets) {
    await assert.rejects(
      runPreviewDeployment(
        { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42, targets },
        dependencies,
      ),
      TypeError,
    );
  }

  assert.deepEqual(calls, []);
});

test('returns an immutable superseded result when stale at startup', async () => {
  const calls = [];
  const dependencies = {
    listAffectedProjects: async () => calls.push('affected'),
    listChangedFiles: async () => calls.push('changed'),
    buildTarget: async () => calls.push('build'),
    deployTarget: async () => calls.push('deploy'),
    getPullRequestHead: async (prNumber) => {
      calls.push(['head', prNumber]);
      return NEW_HEAD_SHA;
    },
    findPreviewComment: async () => calls.push('find-comment'),
    createPreviewComment: async () => calls.push('create-comment'),
    updatePreviewComment: async () => calls.push('update-comment'),
    deletePreviewComment: async () => calls.push('delete-comment'),
    appendSummary: async () => calls.push('summary'),
  };

  const result = await runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  assert.deepEqual(result, { status: 'superseded' });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, [['head', 42]]);
});

test('deletes a stale preview comment for a current no-target run', async () => {
  const calls = [];
  const dependencies = {
    listAffectedProjects: async (range) => {
      calls.push(['affected', range]);
      return [];
    },
    listChangedFiles: async (range) => {
      calls.push(['changed', range]);
      return ['README.md'];
    },
    buildTarget: async () => calls.push('build'),
    deployTarget: async () => calls.push('deploy'),
    getPullRequestHead: async (prNumber) => {
      calls.push(['head', prNumber]);
      return HEAD_SHA;
    },
    findPreviewComment: async (prNumber) => {
      calls.push(['find-comment', prNumber]);
      return { id: 99 };
    },
    createPreviewComment: async () => calls.push('create-comment'),
    updatePreviewComment: async () => calls.push('update-comment'),
    deletePreviewComment: async (commentId) =>
      calls.push(['delete-comment', commentId]),
    appendSummary: async () => calls.push('summary'),
  };

  const result = await runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  assert.deepEqual(result, { status: 'no-targets' });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, [
    ['head', 42],
    ['affected', { baseSha: BASE_SHA, headSha: HEAD_SHA }],
    ['changed', { baseSha: BASE_SHA, headSha: HEAD_SHA }],
    ['head', 42],
    ['find-comment', 42],
    ['delete-comment', 99],
  ]);
});

test('leaves the preview comment untouched when a no-target run becomes stale', async () => {
  const calls = [];
  const currentHeads = [HEAD_SHA, NEW_HEAD_SHA];
  const dependencies = {
    listAffectedProjects: async () => {
      calls.push('affected');
      return [];
    },
    listChangedFiles: async () => {
      calls.push('changed');
      return ['README.md'];
    },
    buildTarget: async () => calls.push('build'),
    deployTarget: async () => calls.push('deploy'),
    getPullRequestHead: async () => {
      calls.push('head');
      return currentHeads.shift();
    },
    findPreviewComment: async () => {
      calls.push('find-comment');
      return { id: 99 };
    },
    createPreviewComment: async () => calls.push('create-comment'),
    updatePreviewComment: async () => calls.push('update-comment'),
    deletePreviewComment: async () => calls.push('delete-comment'),
    appendSummary: async () => calls.push('summary'),
  };

  const result = await runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  assert.deepEqual(result, { status: 'superseded' });
  assert.deepEqual(calls, ['head', 'affected', 'changed', 'head']);
});

test('builds and deploys selected targets in manifest order before creating a comment', async () => {
  const calls = [];
  const dependencies = {
    listAffectedProjects: async (range) => {
      calls.push(['affected', range]);
      return ['smart-home-angular', 'www'];
    },
    listChangedFiles: async (range) => {
      calls.push(['changed', range]);
      return ['www/index.ts', 'samples/smart-home/angular/src/app.ts'];
    },
    buildTarget: async (target) => {
      calls.push(['build', target.id]);
      return { ok: true };
    },
    deployTarget: async (options) => {
      calls.push(['deploy', options]);
      return { ok: true };
    },
    getPullRequestHead: async (prNumber) => {
      calls.push(['head', prNumber]);
      return HEAD_SHA;
    },
    findPreviewComment: async (prNumber) => {
      calls.push(['find-comment', prNumber]);
      return null;
    },
    createPreviewComment: async (comment) =>
      calls.push(['create-comment', comment]),
    updatePreviewComment: async () => calls.push('update-comment'),
    deletePreviewComment: async () => calls.push('delete-comment'),
    appendSummary: async (summary) => calls.push(['summary', summary]),
  };
  const expectedResults = [
    { targetId: 'docs', status: 'success' },
    { targetId: 'smart-home', status: 'success' },
  ];
  const body = renderPreviewComment({
    headSha: HEAD_SHA,
    prNumber: 42,
    results: expectedResults,
  });

  const result = await runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  assert.deepEqual(result, { status: 'success', results: expectedResults });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.results), true);
  assert.equal(result.results.every(Object.isFrozen), true);
  assert.deepEqual(calls, [
    ['head', 42],
    ['affected', { baseSha: BASE_SHA, headSha: HEAD_SHA }],
    ['changed', { baseSha: BASE_SHA, headSha: HEAD_SHA }],
    ['build', 'docs'],
    ['deploy', { target: PAGES_TARGETS[0], branch: 'pr-42', sha: HEAD_SHA }],
    ['build', 'smart-home'],
    ['deploy', { target: PAGES_TARGETS[3], branch: 'pr-42', sha: HEAD_SHA }],
    ['head', 42],
    ['find-comment', 42],
    ['create-comment', { prNumber: 42, body }],
    ['summary', `## Cloudflare previews\n\n${body}`],
  ]);
});

test('updates an existing preview comment after a successful run', async () => {
  const calls = [];
  const dependencies = {
    listAffectedProjects: async () => ['finance-angular'],
    listChangedFiles: async () => ['samples/finance/angular/src/app.ts'],
    buildTarget: async () => ({ ok: true }),
    deployTarget: async () => ({ ok: true }),
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => ({ id: 101 }),
    createPreviewComment: async () => calls.push('create-comment'),
    updatePreviewComment: async (comment) =>
      calls.push(['update-comment', comment]),
    deletePreviewComment: async () => calls.push('delete-comment'),
    appendSummary: async () => undefined,
  };
  const body = renderPreviewComment({
    headSha: HEAD_SHA,
    prNumber: 42,
    results: [{ targetId: 'finance', status: 'success' }],
  });

  await runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  assert.deepEqual(calls, [['update-comment', { commentId: 101, body }]]);
});

test('reports every result and rejects after a build failure', async () => {
  const calls = [];
  const dependencies = {
    listAffectedProjects: async () => ['www', 'finance-angular'],
    listChangedFiles: async () => [
      'www/index.ts',
      'samples/finance/angular/src/app.ts',
    ],
    buildTarget: async (target) => {
      calls.push(['build', target.id]);
      return target.id === 'docs'
        ? { ok: false, error: 'docs did not build' }
        : { ok: true };
    },
    deployTarget: async ({ target }) => {
      calls.push(['deploy', target.id]);
      return { ok: true };
    },
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => null,
    createPreviewComment: async ({ body }) =>
      calls.push(['create-comment', body]),
    updatePreviewComment: async () => calls.push('update-comment'),
    deletePreviewComment: async () => calls.push('delete-comment'),
    appendSummary: async (summary) => calls.push(['summary', summary]),
  };
  const expectedResults = [
    {
      targetId: 'docs',
      status: 'build-failed',
      error: 'docs did not build',
    },
    { targetId: 'finance', status: 'success' },
  ];
  const body = renderPreviewComment({
    headSha: HEAD_SHA,
    prNumber: 42,
    results: expectedResults,
  });

  await assert.rejects(
    runPreviewDeployment(
      { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
      dependencies,
    ),
    {
      name: 'Error',
      message:
        'Cloudflare preview deployment failed: Docs build: docs did not build',
    },
  );

  assert.deepEqual(calls, [
    ['build', 'docs'],
    ['build', 'finance'],
    ['deploy', 'finance'],
    ['create-comment', body],
    ['summary', `## Cloudflare previews\n\n${body}`],
  ]);
});

test('reports every result and rejects after a deployment failure', async () => {
  const calls = [];
  const dependencies = {
    listAffectedProjects: async () => ['www', 'finance-angular'],
    listChangedFiles: async () => [
      'www/index.ts',
      'samples/finance/angular/src/app.ts',
    ],
    buildTarget: async (target) => {
      calls.push(['build', target.id]);
      return { ok: true };
    },
    deployTarget: async ({ target }) => {
      calls.push(['deploy', target.id]);
      return target.id === 'docs'
        ? { ok: false, error: 'wrangler failed' }
        : { ok: true };
    },
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => null,
    createPreviewComment: async ({ body }) =>
      calls.push(['create-comment', body]),
    updatePreviewComment: async () => calls.push('update-comment'),
    deletePreviewComment: async () => calls.push('delete-comment'),
    appendSummary: async (summary) => calls.push(['summary', summary]),
  };
  const expectedResults = [
    {
      targetId: 'docs',
      status: 'deploy-failed',
      error: 'wrangler failed',
    },
    { targetId: 'finance', status: 'success' },
  ];
  const body = renderPreviewComment({
    headSha: HEAD_SHA,
    prNumber: 42,
    results: expectedResults,
  });

  await assert.rejects(
    runPreviewDeployment(
      { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
      dependencies,
    ),
    {
      name: 'Error',
      message:
        'Cloudflare preview deployment failed: Docs deploy: wrangler failed',
    },
  );

  assert.deepEqual(calls, [
    ['build', 'docs'],
    ['deploy', 'docs'],
    ['build', 'finance'],
    ['deploy', 'finance'],
    ['create-comment', body],
    ['summary', `## Cloudflare previews\n\n${body}`],
  ]);
});

test('does not publish a comment when the run becomes stale after deployment', async () => {
  const calls = [];
  const currentHeads = [HEAD_SHA, NEW_HEAD_SHA];
  const dependencies = {
    listAffectedProjects: async () => ['www'],
    listChangedFiles: async () => ['www/index.ts'],
    buildTarget: async () => {
      calls.push('build');
      return { ok: true };
    },
    deployTarget: async () => {
      calls.push('deploy');
      return { ok: true };
    },
    getPullRequestHead: async () => {
      calls.push('head');
      return currentHeads.shift();
    },
    findPreviewComment: async () => calls.push('find-comment'),
    createPreviewComment: async () => calls.push('create-comment'),
    updatePreviewComment: async () => calls.push('update-comment'),
    deletePreviewComment: async () => calls.push('delete-comment'),
    appendSummary: async () => calls.push('summary'),
  };

  const result = await runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  assert.deepEqual(result, { status: 'superseded' });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, ['head', 'build', 'deploy', 'head']);
});

test('propagates preview comment creation failures', async () => {
  const error = new Error('create failed');
  const dependencies = {
    listAffectedProjects: async () => ['www'],
    listChangedFiles: async () => ['www/index.ts'],
    buildTarget: async () => ({ ok: true }),
    deployTarget: async () => ({ ok: true }),
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => null,
    createPreviewComment: async () => {
      throw error;
    },
    updatePreviewComment: async () => undefined,
    deletePreviewComment: async () => undefined,
    appendSummary: async () => undefined,
  };

  const deployment = runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  await assert.rejects(deployment, (received) => received === error);
});

test('propagates preview comment update failures', async () => {
  const error = new Error('update failed');
  const dependencies = {
    listAffectedProjects: async () => ['www'],
    listChangedFiles: async () => ['www/index.ts'],
    buildTarget: async () => ({ ok: true }),
    deployTarget: async () => ({ ok: true }),
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => ({ id: 99 }),
    createPreviewComment: async () => undefined,
    updatePreviewComment: async () => {
      throw error;
    },
    deletePreviewComment: async () => undefined,
    appendSummary: async () => undefined,
  };

  const deployment = runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  await assert.rejects(deployment, (received) => received === error);
});

test('propagates preview comment deletion failures', async () => {
  const error = new Error('delete failed');
  const dependencies = {
    listAffectedProjects: async () => [],
    listChangedFiles: async () => ['README.md'],
    buildTarget: async () => ({ ok: true }),
    deployTarget: async () => ({ ok: true }),
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => ({ id: 99 }),
    createPreviewComment: async () => undefined,
    updatePreviewComment: async () => undefined,
    deletePreviewComment: async () => {
      throw error;
    },
    appendSummary: async () => undefined,
  };

  const deployment = runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  await assert.rejects(deployment, (received) => received === error);
});

test('does not mutate preview inputs or injected target arrays', async () => {
  const targets = Object.freeze([PAGES_TARGETS[0]]);
  const options = Object.freeze({
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    prNumber: 42,
    targets,
  });
  const affectedProjects = Object.freeze(['www']);
  const changedFiles = Object.freeze(['www/index.ts']);
  const dependencies = {
    listAffectedProjects: async () => affectedProjects,
    listChangedFiles: async () => changedFiles,
    buildTarget: async () => ({ ok: true }),
    deployTarget: async () => ({ ok: true }),
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => null,
    createPreviewComment: async () => undefined,
    updatePreviewComment: async () => undefined,
    deletePreviewComment: async () => undefined,
    appendSummary: async () => undefined,
  };

  await runPreviewDeployment(options, dependencies);

  assert.deepEqual(options, {
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    prNumber: 42,
    targets: [PAGES_TARGETS[0]],
  });
  assert.deepEqual(affectedProjects, ['www']);
  assert.deepEqual(changedFiles, ['www/index.ts']);
  assert.deepEqual(targets, [PAGES_TARGETS[0]]);
});
