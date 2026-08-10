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
  formatCliError,
  nxAffectedArgs,
  parseDeployArgs,
  runPreviewDeployment,
  runProductionDeployment,
  wranglerDeployArgs,
} from './deploy.mjs';

const BASE_SHA = '1111111111111111111111111111111111111111';
const HEAD_SHA = 'abcdef123456abcdef123456abcdef123456abcd';
const NEW_HEAD_SHA = '2222222222222222222222222222222222222222';

function createSpawnResult({
  code = 0,
  stdout = '',
  stderr = '',
  error,
  stdoutError,
  stderrError,
} = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;

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

      if (stdoutError) {
        child.stdout.emit('error', stdoutError);
      }

      if (stderrError) {
        child.stderr.emit('error', stderrError);
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
  const invalidTargets = [
    [],
    [{ ...PAGES_TARGETS[0], outputDirectory: '' }],
    [{ ...PAGES_TARGETS[0], nxProject: '--help' }],
    [{ ...PAGES_TARGETS[0], outputDirectory: '../dist/www' }],
    [{ ...PAGES_TARGETS[0], wranglerConfigDirectory: '../www/analog' }],
  ];

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
  const calls = [];
  const dependencies = {
    listAffectedProjects: async () => ['www'],
    listChangedFiles: async () => ['www/index.ts'],
    buildTarget: async () => ({ ok: true }),
    deployTarget: async () => ({ ok: true }),
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => null,
    createPreviewComment: async () => {
      calls.push('create-comment');
      throw error;
    },
    updatePreviewComment: async () => undefined,
    deletePreviewComment: async () => undefined,
    appendSummary: async () => calls.push('summary'),
  };

  const deployment = runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  await assert.rejects(deployment, (received) => received === error);
  assert.deepEqual(calls, ['create-comment', 'summary']);
});

test('aggregates preview deployment, comment, and summary failures after attempting reports', async () => {
  const commentError = new Error('comment failed');
  const summaryError = new Error('summary failed');
  const calls = [];
  const dependencies = {
    listAffectedProjects: async () => ['www'],
    listChangedFiles: async () => ['www/index.ts'],
    buildTarget: async () => ({ ok: false, error: 'build failed' }),
    deployTarget: async () => ({ ok: true }),
    getPullRequestHead: async () => HEAD_SHA,
    findPreviewComment: async () => null,
    createPreviewComment: async () => {
      calls.push('comment');
      throw commentError;
    },
    updatePreviewComment: async () => undefined,
    deletePreviewComment: async () => undefined,
    appendSummary: async () => {
      calls.push('summary');
      throw summaryError;
    },
  };

  const deployment = runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  await assert.rejects(deployment, (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.equal(error.errors.length, 3);
    assert.match(error.errors[0].message, /Docs build: build failed/);
    assert.strictEqual(error.errors[1], commentError);
    assert.strictEqual(error.errors[2], summaryError);
    return true;
  });
  assert.deepEqual(calls, ['comment', 'summary']);
});

test('preserves preview failures when the post-deployment head lookup and summary fail', async () => {
  const headError = new Error('head lookup failed');
  const summaryError = new Error('summary failed');
  const calls = [];
  let headLookups = 0;
  const dependencies = {
    listAffectedProjects: async () => ['www'],
    listChangedFiles: async () => ['www/index.ts'],
    buildTarget: async () => ({ ok: false, error: 'build failed' }),
    deployTarget: async () => ({ ok: true }),
    getPullRequestHead: async () => {
      headLookups += 1;

      if (headLookups === 1) {
        return HEAD_SHA;
      }

      throw headError;
    },
    findPreviewComment: async () => calls.push('find-comment'),
    createPreviewComment: async () => calls.push('create-comment'),
    updatePreviewComment: async () => calls.push('update-comment'),
    deletePreviewComment: async () => calls.push('delete-comment'),
    appendSummary: async () => {
      calls.push('summary');
      throw summaryError;
    },
  };

  const deployment = runPreviewDeployment(
    { baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 42 },
    dependencies,
  );

  await assert.rejects(deployment, (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.equal(error.errors.length, 3);
    assert.match(error.errors[0].message, /Docs build: build failed/);
    assert.strictEqual(error.errors[1], headError);
    assert.strictEqual(error.errors[2], summaryError);
    return true;
  });
  assert.deepEqual(calls, ['summary']);
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
    {
      sha: HEAD_SHA,
      targets: [{ ...PAGES_TARGETS[0], nxProject: '--help' }],
    },
    {
      sha: HEAD_SHA,
      targets: [{ ...PAGES_TARGETS[0], outputDirectory: '/tmp/www' }],
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

test('aggregates production deployment and summary failures', async () => {
  const summaryError = new Error('summary failed');
  const dependencies = {
    buildTarget: async () => ({ ok: true }),
    deployTarget: async () => ({ ok: false, error: 'wrangler failed' }),
    appendSummary: async () => {
      throw summaryError;
    },
  };

  const deployment = runProductionDeployment(
    { sha: HEAD_SHA, targets: [PAGES_TARGETS[0]] },
    dependencies,
  );

  await assert.rejects(deployment, (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.equal(error.errors.length, 2);
    assert.match(error.errors[0].message, /Docs deploy: wrangler failed/);
    assert.strictEqual(error.errors[1], summaryError);
    return true;
  });
});

test('propagates a lone production summary failure', async () => {
  const summaryError = new Error('summary failed');
  const dependencies = {
    buildTarget: async () => ({ ok: true }),
    deployTarget: async () => ({ ok: true }),
    appendSummary: async () => {
      throw summaryError;
    },
  };

  const deployment = runProductionDeployment(
    { sha: HEAD_SHA, targets: [PAGES_TARGETS[0]] },
    dependencies,
  );

  await assert.rejects(deployment, (error) => error === summaryError);
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

test('execution rejects parser-valid short SHAs before calling dependencies', async () => {
  const calls = [];
  const dependencies = new Proxy(
    {},
    {
      get() {
        calls.push('dependency');
        return async () => undefined;
      },
    },
  );

  await assert.rejects(
    executeDeployCommand(
      ['preview', '--base', 'a', '--head', 'b', '--pr', '42'],
      dependencies,
    ),
    /Base SHA must be 7-64 hexadecimal characters/,
  );
  await assert.rejects(
    executeDeployCommand(['production', '--sha', 'abc'], dependencies),
    /Production SHA must be 7-64 hexadecimal characters/,
  );
  assert.deepEqual(calls, []);
});

test('formats nested aggregate errors with every underlying CLI cause', () => {
  const error = new AggregateError(
    [
      new Error('deployment failed'),
      new AggregateError(
        [new TypeError('comment failed'), 'summary failed'],
        'reporting failed',
      ),
    ],
    'Cloudflare deployment failed',
  );

  const message = formatCliError(error);

  assert.equal(
    message,
    [
      'Cloudflare deployment failed',
      '  - deployment failed',
      '  - reporting failed',
      '    - comment failed',
      '    - summary failed',
    ].join('\n'),
  );
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
    '--no-install',
    'wrangler',
    '--cwd=www/analog',
    'pages',
    'deploy',
    '../../dist/www/analog',
    '--project-name=hashbrown-www',
    '--branch=main',
    '--commit-hash=abc',
    '--commit-dirty=true',
    '--no-bundle',
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
  assert.equal(wrangler.includes('--yes'), false);
  assert.equal(
    wrangler.some((argument) => argument.includes('@4.114.0')),
    false,
  );
});

test('rejects an empty derived Wrangler output directory', () => {
  const target = {
    ...PAGES_TARGETS[0],
    outputDirectory: 'www/analog',
    wranglerConfigDirectory: 'www/analog',
  };

  const act = () =>
    wranglerDeployArgs(target, {
      branch: 'main',
      sha: 'abc',
    });

  assert.throws(act, {
    name: 'TypeError',
    message: 'Wrangler output directory must be a safe positional argument.',
  });
});

test('rejects an option-like derived Wrangler output directory', () => {
  const target = {
    ...PAGES_TARGETS[0],
    outputDirectory: 'www/--help',
    wranglerConfigDirectory: 'www',
  };

  const act = () =>
    wranglerDeployArgs(target, {
      branch: 'main',
      sha: 'abc',
    });

  assert.throws(act, {
    name: 'TypeError',
    message: 'Wrangler output directory must be a safe positional argument.',
  });
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

test('uses stdout diagnostics when a failed subprocess has no stderr', async () => {
  const runSubprocess = createSubprocessRunner(
    createSpawnResult({ code: 2, stdout: 'stdout diagnostic\n' }),
  );

  const result = await runSubprocess('tool', ['argument']);

  assert.equal(result.ok, false);
  assert.match(result.error, /stdout diagnostic/);
});

test('normalizes stdout and stderr stream errors without rejecting', async () => {
  const stdoutRunner = createSubprocessRunner(
    createSpawnResult({ stdoutError: new Error('stdout stream failed') }),
  );
  const stderrRunner = createSubprocessRunner(
    createSpawnResult({ stderrError: new Error('stderr stream failed') }),
  );

  const stdoutResult = await stdoutRunner('tool', ['stdout']);
  const stderrResult = await stderrRunner('tool', ['stderr']);

  assert.equal(stdoutResult.ok, false);
  assert.match(stdoutResult.error, /stdout stream failed/);
  assert.equal(stderrResult.ok, false);
  assert.match(stderrResult.error, /stderr stream failed/);
});

test('terminates a child after a stream error and resolves only after close', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const lifecycle = [];
  let fallback;
  child.kill = (signal) => {
    lifecycle.push(['kill', signal]);
    return true;
  };
  const runSubprocess = createSubprocessRunner(() => child, {
    killTimeoutMs: 25,
    setTimeoutImpl(callback, timeout) {
      lifecycle.push(['timeout', timeout]);
      fallback = callback;
      return { unref: () => lifecycle.push('unref') };
    },
    clearTimeoutImpl() {
      lifecycle.push('clear-timeout');
    },
  });
  let resolved = false;

  const resultPromise = runSubprocess('tool', ['argument']).then((result) => {
    resolved = true;
    return result;
  });
  child.stdout.emit('error', new Error('stdout stream failed'));
  await Promise.resolve();

  assert.equal(resolved, false);
  assert.deepEqual(lifecycle, [['kill', 'SIGTERM'], ['timeout', 25], 'unref']);

  fallback();
  await Promise.resolve();

  assert.equal(resolved, false);
  assert.deepEqual(lifecycle.at(-1), ['kill', 'SIGKILL']);

  child.emit('close', null, 'SIGKILL');
  const result = await resultPromise;

  assert.equal(result.ok, false);
  assert.match(result.error, /stdout stream failed/);
  assert.equal(lifecycle.at(-1), 'clear-timeout');
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
  assert.equal(calls[0][1].signal instanceof AbortSignal, true);
});

test('GitHub client rejects unsafe repository names before fetching', () => {
  const calls = [];
  const invalidRepositories = [
    './repo',
    '../repo',
    'owner/.',
    'owner/..',
    '-owner/repo',
    'owner-/repo',
    'owner/repo?query=true',
    'owner/repo#fragment',
    'owner/repo/child',
    'owner name/repo',
    'owner/repo name',
  ];

  for (const repository of invalidRepositories) {
    assert.throws(
      () =>
        createGitHubClient({
          fetchImpl: async (...args) => calls.push(args),
          token: 'secret',
          repository,
        }),
      {
        name: 'TypeError',
        message: 'GitHub repository must use safe owner/name segments.',
      },
    );
  }

  assert.deepEqual(calls, []);
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

test('GitHub client stops comment pagination after a full page then an empty page', async () => {
  const pages = [
    Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      body: 'ordinary comment',
      user: { login: 'github-actions[bot]' },
    })),
    [],
  ];
  const calls = [];
  const client = createGitHubClient({
    fetchImpl: async (...args) => {
      calls.push(args);
      return jsonResponse(pages.shift());
    },
    token: 'secret',
    repository: 'hashbrownai/hashbrown',
  });

  const comment = await client.findPreviewComment(42);

  assert.equal(comment, null);
  assert.equal(calls.length, 2);
  assert.equal(
    calls.every(([, options]) => options.signal instanceof AbortSignal),
    true,
  );
});

test('GitHub client finds a marker beyond ten full comment pages', async () => {
  const calls = [];
  const client = createGitHubClient({
    fetchImpl: async (...args) => {
      calls.push(args);
      const page = calls.length;

      if (page === 11) {
        return jsonResponse([
          {
            id: 1001,
            body: PREVIEW_COMMENT_MARKER,
            user: { login: 'github-actions[bot]' },
          },
        ]);
      }

      return jsonResponse(
        Array.from({ length: 100 }, (_, index) => ({
          id: (page - 1) * 100 + index + 1,
          body: 'ordinary comment',
          user: { login: 'github-actions[bot]' },
        })),
      );
    },
    token: 'secret',
    repository: 'hashbrownai/hashbrown',
  });

  const comment = await client.findPreviewComment(42);

  assert.deepEqual(comment, { id: 1001 });
  assert.equal(calls.length, 11);
});

test('GitHub client rejects a repeated full comment page without progress', async () => {
  const fullPage = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    body: 'ordinary comment',
    user: { login: 'github-actions[bot]' },
  }));
  const calls = [];
  const client = createGitHubClient({
    fetchImpl: async (...args) => {
      calls.push(args);
      return jsonResponse(fullPage);
    },
    token: 'secret',
    repository: 'hashbrownai/hashbrown',
  });

  await assert.rejects(
    client.findPreviewComment(42),
    /GitHub comment pagination made no progress/,
  );
  assert.equal(calls.length, 2);
});

test('GitHub client rejects malformed comment arrays without another request', async () => {
  const calls = [];
  const client = createGitHubClient({
    fetchImpl: async (...args) => {
      calls.push(args);
      return jsonResponse({ comments: [] });
    },
    token: 'secret',
    repository: 'hashbrownai/hashbrown',
  });

  await assert.rejects(
    client.findPreviewComment(42),
    /Malformed GitHub comments response/,
  );
  assert.equal(calls.length, 1);
});

test('GitHub client rejects comment pages without valid positive integer ids', async () => {
  const calls = [];
  const client = createGitHubClient({
    fetchImpl: async (...args) => {
      calls.push(args);
      return jsonResponse([
        {
          id: '101',
          body: PREVIEW_COMMENT_MARKER,
          user: { login: 'github-actions[bot]' },
        },
      ]);
    },
    token: 'secret',
    repository: 'hashbrownai/hashbrown',
  });

  await assert.rejects(
    client.findPreviewComment(42),
    /GitHub comments must have positive integer ids/,
  );
  assert.equal(calls.length, 1);
});

test('GitHub client cancels a request after its timeout', async () => {
  let requestSignal;
  const client = createGitHubClient({
    fetchImpl: async (_url, options) => {
      requestSignal = options.signal;

      return new Promise((_resolve, reject) => {
        requestSignal.addEventListener(
          'abort',
          () => reject(requestSignal.reason),
          { once: true },
        );
      });
    },
    token: 'secret',
    repository: 'hashbrownai/hashbrown',
    requestTimeoutMs: 5,
  });

  await assert.rejects(client.getPullRequestHead(42), {
    name: 'TimeoutError',
  });
  assert.equal(requestSignal.aborted, true);
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
      PATH: '/injected/bin',
      HOME: '/home/runner',
      CI: 'true',
      LANG: 'C.UTF-8',
      VITE_FIREBASE_API_KEY: 'public-api-key',
      VITE_FIREBASE_APP_ID: 'public-app-id',
      VITE_FIREBASE_PROJECT_ID: 'public-project-id',
      NX_DAEMON: 'false',
      NX_VERBOSE_LOGGING: 'true',
      NX_TASKS_RUNNER_DYNAMIC_OUTPUT: 'false',
      NPM_CONFIG_CACHE: '/home/runner/.npm',
      NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
      npm_config_loglevel: 'warn',
      npm_config_prefer_offline: 'true',
      NODE_OPTIONS: '--max-old-space-size=4096',
      HTTPS_PROXY: 'https://proxy.example.com',
      NO_PROXY: 'localhost,127.0.0.1',
      NODE_EXTRA_CA_CERTS: '/etc/ssl/custom.pem',
      GITHUB_TOKEN: 'secret',
      GITHUB_REPOSITORY: 'hashbrownai/hashbrown',
      GITHUB_STEP_SUMMARY: '/tmp/summary.md',
      CLOUDFLARE_API_TOKEN: 'cloudflare-token',
      CLOUDFLARE_ACCOUNT_ID: 'cloudflare-account',
      ACTIONS_RUNTIME_TOKEN: 'actions-secret',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-secret',
      NX_CLOUD_ACCESS_TOKEN: 'nx-secret',
      NX_CLOUD_ENCRYPTION_KEY: 'nx-encryption-secret',
      NX_CLOUD_CREDENTIALS: 'nx-credentials',
      NPM_CONFIG_AUTH_TOKEN: 'npm-secret',
      NPM_CONFIG_OTP: '123456',
      'npm_config_//registry.npmjs.org/:_authToken': 'registry-secret',
      NpM_cOnFiG_aUtH: 'mixed-case-auth',
      npm_CONFIG_ToKeN: 'mixed-case-token',
      NX_CrEdEnTiAl: 'mixed-case-credential',
      CUSTOM_SECRET: 'custom-secret',
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
  const nonsecretEnvironment = {
    PATH: '/injected/bin',
    HOME: '/home/runner',
    CI: 'true',
    LANG: 'C.UTF-8',
    VITE_FIREBASE_API_KEY: 'public-api-key',
    VITE_FIREBASE_APP_ID: 'public-app-id',
    VITE_FIREBASE_PROJECT_ID: 'public-project-id',
    NX_DAEMON: 'false',
    NX_VERBOSE_LOGGING: 'true',
    NX_TASKS_RUNNER_DYNAMIC_OUTPUT: 'false',
    NPM_CONFIG_CACHE: '/home/runner/.npm',
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
    npm_config_loglevel: 'warn',
    npm_config_prefer_offline: 'true',
    NODE_OPTIONS: '--max-old-space-size=4096',
    HTTPS_PROXY: 'https://proxy.example.com',
    NO_PROXY: 'localhost,127.0.0.1',
    NODE_EXTRA_CA_CERTS: '/etc/ssl/custom.pem',
  };
  assert.deepEqual(
    spawnCalls.slice(0, 3).map(([, , options]) => options.env),
    [nonsecretEnvironment, nonsecretEnvironment, nonsecretEnvironment],
  );
  assert.deepEqual(spawnCalls[3][2].env, {
    ...nonsecretEnvironment,
    CLOUDFLARE_API_TOKEN: 'cloudflare-token',
    CLOUDFLARE_ACCOUNT_ID: 'cloudflare-account',
  });
  assert.equal(
    spawnCalls.every(([, , options]) => options.env.GITHUB_TOKEN === undefined),
    true,
  );
  assert.equal(spawnResults.length, 0);
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
      CLOUDFLARE_API_TOKEN: 'cloudflare-token',
      CLOUDFLARE_ACCOUNT_ID: 'cloudflare-account',
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
    env: {
      GITHUB_STEP_SUMMARY: '/tmp/summary.md',
      CLOUDFLARE_API_TOKEN: 'cloudflare-token',
      CLOUDFLARE_ACCOUNT_ID: 'cloudflare-account',
    },
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
