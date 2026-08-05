import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  PAGES_TARGETS,
  PREVIEW_COMMENT_MARKER,
  renderPreviewComment,
} from './deployment.mjs';
import {
  createGitHubClient,
  createRuntimeDependencies,
  createSubprocessRunner,
  executeDeployCommand,
  nxAffectedArgs,
  parseDeployArgs,
  runPreviewDeployment,
  runProductionDeployment,
  wranglerDeployArgs,
} from './deploy.mjs';

const BASE_SHA = '1111111111111111111111111111111111111111';
const HEAD_SHA = 'abcdef123456abcdef123456abcdef123456abcd';
const NEW_HEAD_SHA = '2222222222222222222222222222222222222222';

function createSpawnResult({ code = 0, stdout = '', stderr = '', error } = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    queueMicrotask(() => {
      if (error) {
        child.emit('error', error);
        return;
      }

      if (stdout) {
        child.stdout.emit('data', Buffer.from(stdout));
      }

      if (stderr) {
        child.stderr.emit('data', Buffer.from(stderr));
      }

      child.emit('close', code);
    });

    return child;
  };
}

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

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

test('rejects an invalid Cloudflare project slug before calling dependencies', async () => {
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
  const targets = [{ ...PAGES_TARGETS[0], cloudflareProject: 'Hashbrown-www' }];

  await assert.rejects(
    runPreviewDeployment(
      { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42, targets },
      dependencies,
    ),
    {
      name: 'TypeError',
      message:
        'Pages target cloudflareProject must be a lowercase Pages project slug.',
    },
  );

  assert.deepEqual(calls, []);
});

test('validates deployment options before calling dependencies', async () => {
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
  const invalidOptions = [
    { baseSha: 'not-a-sha', headSha: HEAD_SHA, prNumber: 42 },
    { baseSha: BASE_SHA, headSha: 'not-a-sha', prNumber: 42 },
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 0 },
  ];

  for (const options of invalidOptions) {
    await assert.rejects(
      runPreviewDeployment(options, dependencies),
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
    ['head', 42],
    ['delete-comment', 99],
  ]);
});

test('does not delete a comment when the PR head changes during lookup', async () => {
  const calls = [];
  const currentHeads = [HEAD_SHA, HEAD_SHA, NEW_HEAD_SHA];
  const dependencies = {
    listAffectedProjects: async () => [],
    listChangedFiles: async () => ['README.md'],
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
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, ['head', 'head', 'find-comment', 'head']);
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
    ['head', 42],
    ['create-comment', { prNumber: 42, body }],
    ['summary', `## Cloudflare previews\n\n${body}`],
  ]);
});

test('deploys and renders a valid custom target manifest', async () => {
  const target = Object.freeze({
    id: 'custom',
    displayName: 'Custom App',
    nxProject: 'custom-app',
    cloudflareProject: 'hashbrown-custom',
    outputDirectory: 'dist/custom',
  });
  const targets = Object.freeze([target]);
  const calls = [];
  const dependencies = {
    listAffectedProjects: async () => ['custom-app'],
    listChangedFiles: async () => ['apps/custom/src/app.ts'],
    buildTarget: async (selectedTarget) => {
      calls.push(['build', selectedTarget]);
      return { ok: true };
    },
    deployTarget: async (options) => {
      calls.push(['deploy', options]);
      return { ok: true };
    },
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => null,
    createPreviewComment: async (comment) =>
      calls.push(['create-comment', comment]),
    updatePreviewComment: async () => calls.push('update-comment'),
    deletePreviewComment: async () => calls.push('delete-comment'),
    appendSummary: async () => undefined,
  };
  const expectedBody = renderPreviewComment({
    headSha: HEAD_SHA,
    prNumber: 42,
    results: [{ targetId: 'custom', status: 'success' }],
    targets,
  });

  const result = await runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42, targets },
    dependencies,
  );

  assert.deepEqual(result, {
    status: 'success',
    results: [{ targetId: 'custom', status: 'success' }],
  });
  assert.deepEqual(calls, [
    ['build', target],
    ['deploy', { target, branch: 'pr-42', sha: HEAD_SHA }],
    ['create-comment', { prNumber: 42, body: expectedBody }],
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

test('does not create a comment when the PR head changes during lookup', async () => {
  const calls = [];
  const currentHeads = [HEAD_SHA, HEAD_SHA, NEW_HEAD_SHA];
  const dependencies = {
    listAffectedProjects: async () => ['www'],
    listChangedFiles: async () => ['www/index.ts'],
    buildTarget: async () => ({ ok: true }),
    deployTarget: async () => ({ ok: true }),
    getPullRequestHead: async () => {
      calls.push('head');
      return currentHeads.shift();
    },
    findPreviewComment: async () => {
      calls.push('find-comment');
      return null;
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
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, ['head', 'head', 'find-comment', 'head']);
});

test('does not update a comment when the PR head changes during lookup', async () => {
  const calls = [];
  const currentHeads = [HEAD_SHA, HEAD_SHA, NEW_HEAD_SHA];
  const dependencies = {
    listAffectedProjects: async () => ['www'],
    listChangedFiles: async () => ['www/index.ts'],
    buildTarget: async () => ({ ok: true }),
    deployTarget: async () => ({ ok: true }),
    getPullRequestHead: async () => {
      calls.push('head');
      return currentHeads.shift();
    },
    findPreviewComment: async () => {
      calls.push('find-comment');
      return { id: 101 };
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
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, ['head', 'head', 'find-comment', 'head']);
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
    { targetId: 'docs', status: 'build-failed' },
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
    { targetId: 'docs', status: 'deploy-failed' },
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

test('validates production options before calling dependencies', async () => {
  const calls = [];
  const dependencies = {
    buildTarget: async () => calls.push('build'),
    deployTarget: async () => calls.push('deploy'),
    appendSummary: async () => calls.push('summary'),
  };
  const invalidOptions = [
    { sha: 'not-a-sha' },
    { sha: HEAD_SHA, targets: [] },
    {
      sha: HEAD_SHA,
      targets: [{ ...PAGES_TARGETS[0], cloudflareProject: 'Invalid.Project' }],
    },
  ];

  for (const options of invalidOptions) {
    await assert.rejects(
      runProductionDeployment(options, dependencies),
      TypeError,
    );
  }

  assert.deepEqual(calls, []);
});

test('builds every production target before deploying in manifest order', async () => {
  const targets = Object.freeze([PAGES_TARGETS[0], PAGES_TARGETS[1]]);
  const options = Object.freeze({ sha: HEAD_SHA, targets });
  const calls = [];
  const dependencies = {
    buildTarget: async (target) => {
      calls.push(['build', target.id]);
      return { ok: true };
    },
    deployTarget: async (deployment) => {
      calls.push(['deploy', deployment]);
      return { ok: true };
    },
    appendSummary: async (summary) => calls.push(['summary', summary]),
  };

  const result = await runProductionDeployment(options, dependencies);

  assert.deepEqual(result, {
    status: 'success',
    results: [
      { targetId: 'docs', status: 'success' },
      { targetId: 'finance', status: 'success' },
    ],
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.results), true);
  assert.equal(result.results.every(Object.isFrozen), true);
  assert.deepEqual(calls.slice(0, 4), [
    ['build', 'docs'],
    ['build', 'finance'],
    ['deploy', { target: PAGES_TARGETS[0], branch: 'main', sha: HEAD_SHA }],
    ['deploy', { target: PAGES_TARGETS[1], branch: 'main', sha: HEAD_SHA }],
  ]);
  assert.match(calls[4][1], /^## Cloudflare production\n/);
  assert.match(calls[4][1], /\| Docs \| Ready \|/);
  assert.match(calls[4][1], /\| Finance \| Ready \|/);
  assert.deepEqual(options, { sha: HEAD_SHA, targets });
  assert.deepEqual(targets, [PAGES_TARGETS[0], PAGES_TARGETS[1]]);
});

test('reports all production builds and skips every deployment after a build failure', async () => {
  const calls = [];
  const dependencies = {
    buildTarget: async (target) => {
      calls.push(['build', target.id]);
      return target.id === 'finance'
        ? { ok: false, error: 'finance build failed' }
        : { ok: true };
    },
    deployTarget: async () => calls.push('deploy'),
    appendSummary: async (summary) => calls.push(['summary', summary]),
  };

  await assert.rejects(
    runProductionDeployment(
      { sha: HEAD_SHA, targets: [PAGES_TARGETS[0], PAGES_TARGETS[1]] },
      dependencies,
    ),
    {
      message:
        'Cloudflare production deployment failed: Finance build: finance build failed',
    },
  );

  assert.deepEqual(calls.slice(0, 2), [
    ['build', 'docs'],
    ['build', 'finance'],
  ]);
  assert.equal(
    calls.some((call) => call === 'deploy'),
    false,
  );
  assert.equal(calls.at(-1)[0], 'summary');
  assert.match(calls.at(-1)[1], /\| Docs \| Deployment skipped \|/);
  assert.match(calls.at(-1)[1], /\| Finance \| Build failed \|/);
});

test('continues production deployments after a failure and rejects after reporting', async () => {
  const calls = [];
  const dependencies = {
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
    appendSummary: async (summary) => calls.push(['summary', summary]),
  };

  await assert.rejects(
    runProductionDeployment(
      { sha: HEAD_SHA, targets: [PAGES_TARGETS[0], PAGES_TARGETS[1]] },
      dependencies,
    ),
    {
      message:
        'Cloudflare production deployment failed: Docs deploy: wrangler failed',
    },
  );

  assert.deepEqual(calls.slice(0, 4), [
    ['build', 'docs'],
    ['build', 'finance'],
    ['deploy', 'docs'],
    ['deploy', 'finance'],
  ]);
  assert.equal(calls.at(-1)[0], 'summary');
  assert.match(calls.at(-1)[1], /\| Docs \| Deployment failed \|/);
  assert.match(calls.at(-1)[1], /\| Finance \| Ready \|/);
});

test('parses the exact preview and production CLI forms', () => {
  const preview = parseDeployArgs([
    'preview',
    '--base',
    'a',
    '--head',
    'b',
    '--pr',
    '42',
  ]);
  const production = parseDeployArgs(['production', '--sha', 'abc']);

  assert.deepEqual(preview, {
    mode: 'preview',
    baseSha: 'a',
    headSha: 'b',
    prNumber: 42,
  });
  assert.deepEqual(production, { mode: 'production', sha: 'abc' });
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(production), true);
});

test('rejects unknown, missing, reordered, and malformed CLI arguments', () => {
  const invalidArguments = [
    [],
    ['unknown'],
    ['preview', '--base', 'a', '--head', 'b'],
    ['preview', '--head', 'b', '--base', 'a', '--pr', '42'],
    ['preview', '--base', '', '--head', 'b', '--pr', '42'],
    ['preview', '--base', 'not-a-sha', '--head', 'b', '--pr', '42'],
    ['preview', '--base', 'a', '--head', 'b', '--pr', '0'],
    ['preview', '--base', 'a', '--head', 'b', '--pr', '4.2'],
    ['preview', '--base', 'a', '--head', 'b', '--pr', '42', '--extra'],
    ['production'],
    ['production', '--sha', ''],
    ['production', '--sha', 'not-a-sha'],
    ['production', '--sha', 'abc', '--extra'],
  ];

  for (const argv of invalidArguments) {
    assert.throws(() => parseDeployArgs(argv), TypeError);
  }
});

test('builds exact safe Wrangler and Nx affected argument arrays', () => {
  const wrangler = wranglerDeployArgs(PAGES_TARGETS[0], {
    branch: 'main',
    sha: 'abc',
  });
  const nx = nxAffectedArgs({ baseSha: 'a', headSha: 'b' });

  assert.deepEqual(wrangler, [
    'wrangler',
    'pages',
    'deploy',
    PAGES_TARGETS[0].outputDirectory,
    '--project-name=hashbrown-www',
    '--branch=main',
    '--commit-hash=abc',
    '--commit-dirty=true',
  ]);
  assert.deepEqual(nx, [
    'nx',
    'show',
    'projects',
    '--affected',
    '--base=a',
    '--head=b',
    '--withTarget=build',
    '--type=app',
    '--json',
  ]);
  assert.equal(Object.isFrozen(wrangler), true);
  assert.equal(Object.isFrozen(nx), true);
});

test('normalizes successful and failed subprocess completion without rejecting', async () => {
  const success = createSubprocessRunner(
    createSpawnResult({ stdout: 'output\n', stderr: 'warning\n' }),
  );
  const failure = createSubprocessRunner(
    createSpawnResult({ code: 2, stderr: 'command failed\n' }),
  );
  const spawnFailure = createSubprocessRunner(
    createSpawnResult({ error: new Error('spawn failed') }),
  );

  const successResult = await success('tool', ['one']);
  const failureResult = await failure('tool', ['two']);
  const spawnFailureResult = await spawnFailure('tool', ['three']);

  assert.deepEqual(successResult, {
    ok: true,
    stdout: 'output\n',
    stderr: 'warning\n',
  });
  assert.equal(Object.isFrozen(successResult), true);
  assert.equal(failureResult.ok, false);
  assert.match(failureResult.error, /command failed/);
  assert.equal(spawnFailureResult.ok, false);
  assert.match(spawnFailureResult.error, /spawn failed/);
});

test('GitHub client reads a pull request head and rejects malformed responses', async () => {
  const responses = [
    jsonResponse({ head: { sha: HEAD_SHA } }),
    jsonResponse({ head: {} }),
  ];
  const calls = [];
  const client = createGitHubClient({
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return responses.shift();
    },
    token: 'secret',
    repository: 'hashbrownai/hashbrown',
  });

  const sha = await client.getPullRequestHead(42);

  assert.equal(sha, HEAD_SHA);
  await assert.rejects(client.getPullRequestHead(43), /Malformed GitHub/);
  assert.equal(
    calls[0][0],
    'https://api.github.com/repos/hashbrownai/hashbrown/pulls/42',
  );
  assert.equal(calls[0][1].method, 'GET');
  assert.equal(calls[0][1].headers.authorization, 'Bearer secret');
});

test('GitHub client paginates comments and only returns the bot marker', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    body: index === 0 ? PREVIEW_COMMENT_MARKER : 'ordinary comment',
    user: { login: index === 0 ? 'someone-else' : 'github-actions[bot]' },
  }));
  const secondPage = [
    {
      id: 101,
      body: `${PREVIEW_COMMENT_MARKER}\nPreview results`,
      user: { login: 'github-actions[bot]' },
    },
  ];
  const urls = [];
  const client = createGitHubClient({
    fetchImpl: async (url) => {
      urls.push(url);
      return jsonResponse(url.endsWith('page=1') ? firstPage : secondPage);
    },
    token: 'secret',
    repository: 'hashbrownai/hashbrown',
  });

  const comment = await client.findPreviewComment(42);

  assert.deepEqual(comment, { id: 101 });
  assert.equal(Object.isFrozen(comment), true);
  assert.deepEqual(urls, [
    'https://api.github.com/repos/hashbrownai/hashbrown/issues/42/comments?per_page=100&page=1',
    'https://api.github.com/repos/hashbrownai/hashbrown/issues/42/comments?per_page=100&page=2',
  ]);
});

test('GitHub client creates, updates, and deletes preview comments', async () => {
  const calls = [];
  const client = createGitHubClient({
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return jsonResponse(
        {},
        { status: options.method === 'DELETE' ? 204 : 200 },
      );
    },
    token: 'secret',
    repository: 'hashbrownai/hashbrown',
  });

  await client.createPreviewComment({ prNumber: 42, body: 'created' });
  await client.updatePreviewComment({ commentId: 99, body: 'updated' });
  await client.deletePreviewComment(99);

  assert.deepEqual(
    calls.map(([url, options]) => [url, options.method, options.body]),
    [
      [
        'https://api.github.com/repos/hashbrownai/hashbrown/issues/42/comments',
        'POST',
        JSON.stringify({ body: 'created' }),
      ],
      [
        'https://api.github.com/repos/hashbrownai/hashbrown/issues/comments/99',
        'PATCH',
        JSON.stringify({ body: 'updated' }),
      ],
      [
        'https://api.github.com/repos/hashbrownai/hashbrown/issues/comments/99',
        'DELETE',
        undefined,
      ],
    ],
  );
});

test('GitHub client errors include the method, path, and HTTP status', async () => {
  const client = createGitHubClient({
    fetchImpl: async () => jsonResponse({}, { status: 403 }),
    token: 'secret',
    repository: 'hashbrownai/hashbrown',
  });
  const operations = [
    [client.getPullRequestHead(42), 'GET', '/pulls/42'],
    [client.findPreviewComment(42), 'GET', '/issues/42/comments'],
    [
      client.createPreviewComment({ prNumber: 42, body: 'body' }),
      'POST',
      '/issues/42/comments',
    ],
    [
      client.updatePreviewComment({ commentId: 99, body: 'body' }),
      'PATCH',
      '/issues/comments/99',
    ],
    [client.deletePreviewComment(99), 'DELETE', '/issues/comments/99'],
  ];

  for (const [operation, method, path] of operations) {
    await assert.rejects(operation, (error) => {
      assert.match(error.message, new RegExp(method));
      assert.match(error.message, new RegExp(path));
      assert.match(error.message, /403/);
      return true;
    });
  }
});

test('runtime dependencies use safe subprocess arguments and append the step summary', async () => {
  const spawnCalls = [];
  const spawnResults = [
    createSpawnResult({ stdout: '["www","finance-angular"]' }),
    createSpawnResult({ stdout: 'www/index.ts\nREADME.md\n' }),
    createSpawnResult(),
    createSpawnResult(),
  ];
  const appendCalls = [];
  const dependencies = createRuntimeDependencies({
    spawnImpl: (...args) => {
      spawnCalls.push(args);
      return spawnResults.shift()();
    },
    fetchImpl: async () => jsonResponse({}),
    appendFileImpl: async (...args) => appendCalls.push(args),
    env: {
      GITHUB_TOKEN: 'secret',
      GITHUB_REPOSITORY: 'hashbrownai/hashbrown',
      GITHUB_STEP_SUMMARY: '/tmp/summary.md',
    },
  });

  const affected = await dependencies.listAffectedProjects({
    baseSha: 'a',
    headSha: 'b',
  });
  const changed = await dependencies.listChangedFiles({
    baseSha: 'a',
    headSha: 'b',
  });
  const build = await dependencies.buildTarget(PAGES_TARGETS[0]);
  const deploy = await dependencies.deployTarget({
    target: PAGES_TARGETS[0],
    branch: 'main',
    sha: 'abc',
  });
  await dependencies.appendSummary('summary');

  assert.deepEqual(affected, ['www', 'finance-angular']);
  assert.deepEqual(changed, ['www/index.ts', 'README.md']);
  assert.equal(build.ok, true);
  assert.equal(deploy.ok, true);
  assert.deepEqual(
    spawnCalls.map(([command, args]) => [command, args]),
    [
      ['npx', nxAffectedArgs({ baseSha: 'a', headSha: 'b' })],
      ['git', ['diff', '--name-only', 'a...b']],
      ['npx', ['nx', 'build', 'www', '--configuration=production']],
      [
        'npx',
        wranglerDeployArgs(PAGES_TARGETS[0], {
          branch: 'main',
          sha: 'abc',
        }),
      ],
    ],
  );
  assert.deepEqual(appendCalls, [['/tmp/summary.md', 'summary\n', 'utf8']]);
});

test('runtime dependencies reject malformed command output and missing GitHub environment', async () => {
  assert.throws(
    () =>
      createRuntimeDependencies({
        spawnImpl: createSpawnResult(),
        fetchImpl: async () => jsonResponse({}),
        appendFileImpl: async () => undefined,
        env: {},
      }),
    TypeError,
  );

  const dependencies = createRuntimeDependencies({
    spawnImpl: createSpawnResult({ stdout: 'not-json' }),
    fetchImpl: async () => jsonResponse({}),
    appendFileImpl: async () => undefined,
    env: {
      GITHUB_TOKEN: 'secret',
      GITHUB_REPOSITORY: 'hashbrownai/hashbrown',
      GITHUB_STEP_SUMMARY: '/tmp/summary.md',
    },
  });

  await assert.rejects(
    dependencies.listAffectedProjects({ baseSha: 'a', headSha: 'b' }),
    /Nx affected projects returned invalid JSON/,
  );
});

test('runtime production dependencies do not require preview-only GitHub credentials', async () => {
  const dependencies = createRuntimeDependencies({
    spawnImpl: createSpawnResult(),
    fetchImpl: async () => jsonResponse({}),
    appendFileImpl: async () => undefined,
    env: { GITHUB_STEP_SUMMARY: '/tmp/summary.md' },
  });

  const result = await runProductionDeployment(
    { sha: HEAD_SHA, targets: [PAGES_TARGETS[0]] },
    dependencies,
  );

  assert.deepEqual(result, {
    status: 'success',
    results: [{ targetId: 'docs', status: 'success' }],
  });
  await assert.rejects(
    dependencies.getPullRequestHead(42),
    /GitHub token must be a non-empty string/,
  );
});

test('executeDeployCommand dispatches production and preview modes', async () => {
  const productionCalls = [];
  const productionDependencies = {
    buildTarget: async (target) => {
      productionCalls.push(['build', target.id]);
      return { ok: true };
    },
    deployTarget: async ({ target }) => {
      productionCalls.push(['deploy', target.id]);
      return { ok: true };
    },
    appendSummary: async () => productionCalls.push('summary'),
  };
  const previewCalls = [];
  const previewDependencies = {
    listAffectedProjects: async () => [],
    listChangedFiles: async () => [],
    buildTarget: async () => previewCalls.push('build'),
    deployTarget: async () => previewCalls.push('deploy'),
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => null,
    createPreviewComment: async () => previewCalls.push('create'),
    updatePreviewComment: async () => previewCalls.push('update'),
    deletePreviewComment: async () => previewCalls.push('delete'),
    appendSummary: async () => previewCalls.push('summary'),
  };

  await executeDeployCommand(
    ['production', '--sha', HEAD_SHA],
    productionDependencies,
  );
  const previewResult = await executeDeployCommand(
    ['preview', '--base', BASE_SHA, '--head', HEAD_SHA, '--pr', '42'],
    previewDependencies,
  );

  assert.equal(productionCalls.filter((call) => call[0] === 'build').length, 4);
  assert.equal(
    productionCalls.filter((call) => call[0] === 'deploy').length,
    4,
  );
  assert.deepEqual(previewResult, { status: 'no-targets' });
  assert.deepEqual(previewCalls, []);
});
