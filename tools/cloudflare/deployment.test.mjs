import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PAGES_TARGETS,
  PREVIEW_COMMENT_MARKER,
  previewBranch,
  previewUrl,
  renderPreviewComment,
  selectPreviewTargets,
  validatePagesTargets,
} from './deployment.mjs';

const createTarget = (overrides = {}) => ({
  id: 'example',
  displayName: 'Example',
  nxProject: 'example-app',
  cloudflareProject: 'hashbrown-example',
  outputDirectory: 'dist/example',
  ...overrides,
});

test('defines the ordered Pages deployment manifest', () => {
  const expectedTargets = [
    {
      id: 'docs',
      displayName: 'Docs',
      nxProject: 'www',
      cloudflareProject: 'hashbrown-www',
      outputDirectory: 'dist/www/analog/analog/public',
    },
    {
      id: 'finance',
      displayName: 'Finance',
      nxProject: 'finance-angular',
      cloudflareProject: 'hashbrown-finance',
      outputDirectory: 'dist/samples/finance/angular/browser',
    },
    {
      id: 'fast-food',
      displayName: 'Fast Food',
      nxProject: 'fast-food-angular',
      cloudflareProject: 'hashbrown-fast-food',
      outputDirectory: 'dist/samples/fast-food/angular/browser',
    },
    {
      id: 'smart-home',
      displayName: 'Smart Home',
      nxProject: 'smart-home-angular',
      cloudflareProject: 'hashbrown-smart-home',
      outputDirectory: 'dist/samples/smart-home/angular/browser',
    },
  ];

  const targets = PAGES_TARGETS;

  assert.deepEqual(targets, expectedTargets);
});

test('freezes the Pages deployment manifest and its targets', () => {
  const targets = PAGES_TARGETS;

  const targetsAreFrozen = targets.every((target) => Object.isFrozen(target));

  assert.equal(Object.isFrozen(targets), true);
  assert.equal(targetsAreFrozen, true);
});

test('selects one affected Pages project', () => {
  const selection = {
    affectedProjects: ['finance-angular'],
    changedFiles: ['samples/finance/angular/src/app/app.ts'],
  };

  const result = selectPreviewTargets(selection);

  assert.deepEqual(result, [PAGES_TARGETS[1]]);
});

test('selects multiple affected Pages projects in manifest order', () => {
  const selection = {
    affectedProjects: ['smart-home-angular', 'www'],
    changedFiles: ['samples/smart-home/angular/src/app.ts', 'www/index.ts'],
  };

  const result = selectPreviewTargets(selection);

  assert.deepEqual(result, [PAGES_TARGETS[0], PAGES_TARGETS[3]]);
});

test('selects from an injected target manifest', () => {
  const targets = [
    createTarget({ id: 'first', nxProject: 'first-app' }),
    createTarget({ id: 'second', nxProject: 'second-app' }),
  ];
  const selection = {
    affectedProjects: ['second-app'],
    changedFiles: ['apps/second/src/app.ts'],
    targets,
  };

  const result = selectPreviewTargets(selection);

  assert.deepEqual(result, [targets[1]]);
  assert.strictEqual(result[0], targets[1]);
});

test('selects every injected target for each global invalidator', () => {
  const targets = [
    createTarget({ id: 'first', nxProject: 'first-app' }),
    createTarget({ id: 'second', nxProject: 'second-app' }),
  ];
  const invalidators = [
    '.github/workflows/pr-main.yml',
    'nx.json',
    'package.json',
    'package-lock.json',
    'tools/cloudflare/deployment.mjs',
    'tools/cloudflare/nested/example.mjs',
  ];

  const results = invalidators.map((changedFile) =>
    selectPreviewTargets({
      affectedProjects: [],
      changedFiles: [changedFile],
      targets,
    }),
  );

  for (const result of results) {
    assert.deepEqual(result, targets);
  }
});

test('does not select all targets for global invalidator path near-misses', () => {
  const targets = [
    createTarget({ id: 'first', nxProject: 'first-app' }),
    createTarget({ id: 'second', nxProject: 'second-app' }),
  ];
  const changedFiles = [
    'nx.json/child',
    '.github/workflows/pr-main.yml.bak',
    'tools/cloudflarex/file.mjs',
  ];

  const results = changedFiles.map((changedFile) =>
    selectPreviewTargets({
      affectedProjects: [],
      changedFiles: [changedFile],
      targets,
    }),
  );

  for (const result of results) {
    assert.deepEqual(result, []);
  }
});

test('selects no targets for an unrelated changed project', () => {
  const selection = {
    affectedProjects: ['kitchen-sink-angular'],
    changedFiles: ['samples/kitchen-sink/angular/src/app.ts'],
  };

  const result = selectPreviewTargets(selection);

  assert.deepEqual(result, []);
});

test('does not mutate selection inputs', () => {
  const targets = Object.freeze([
    Object.freeze(createTarget({ id: 'first', nxProject: 'first-app' })),
    Object.freeze(createTarget({ id: 'second', nxProject: 'second-app' })),
  ]);
  const affectedProjects = Object.freeze(['second-app']);
  const changedFiles = Object.freeze(['apps/second/src/app.ts']);

  const result = selectPreviewTargets({
    affectedProjects,
    changedFiles,
    targets,
  });

  assert.deepEqual(result, [targets[1]]);
  assert.deepEqual(affectedProjects, ['second-app']);
  assert.deepEqual(changedFiles, ['apps/second/src/app.ts']);
  assert.equal(targets.length, 2);
});

test('validates a non-empty target manifest', () => {
  const targets = [createTarget()];

  const validate = () => validatePagesTargets(targets);

  assert.doesNotThrow(validate);
});

test('rejects an empty target manifest', () => {
  const targets = [];

  const validate = () => validatePagesTargets(targets);

  assert.throws(validate, {
    name: 'TypeError',
    message: 'Pages targets must be a non-empty array.',
  });
});

test('rejects duplicate target ids', () => {
  const targets = [
    createTarget({ nxProject: 'first-app' }),
    createTarget({ nxProject: 'second-app' }),
  ];

  const validate = () => validatePagesTargets(targets);

  assert.throws(validate, {
    name: 'TypeError',
    message: 'Duplicate Pages target id: example.',
  });
});

test('rejects duplicate target Nx projects', () => {
  const targets = [
    createTarget({ id: 'first' }),
    createTarget({ id: 'second' }),
  ];

  const validate = () => validatePagesTargets(targets);

  assert.throws(validate, {
    name: 'TypeError',
    message: 'Duplicate Pages target Nx project: example-app.',
  });
});

test('rejects duplicate Cloudflare deployment destinations', () => {
  const targets = [
    createTarget({ id: 'first', nxProject: 'first-app' }),
    createTarget({ id: 'second', nxProject: 'second-app' }),
  ];

  const validate = () => validatePagesTargets(targets);

  assert.throws(validate, {
    name: 'TypeError',
    message: 'Duplicate Pages deployment destination: hashbrown-example.',
  });
});

test('rejects targets with missing required fields', () => {
  const requiredFields = [
    'id',
    'displayName',
    'nxProject',
    'cloudflareProject',
    'outputDirectory',
  ];
  const invalidTargets = requiredFields.map((field) => ({
    field,
    target: Object.fromEntries(
      Object.entries(createTarget()).filter(
        ([targetField]) => targetField !== field,
      ),
    ),
  }));

  for (const { field, target } of invalidTargets) {
    const validate = () => validatePagesTargets([target]);

    assert.throws(validate, {
      name: 'TypeError',
      message: `Pages target ${field} must be a non-empty string.`,
    });
  }
});

test('rejects targets with empty required fields', () => {
  const requiredFields = [
    'id',
    'displayName',
    'nxProject',
    'cloudflareProject',
    'outputDirectory',
  ];
  const invalidTargets = requiredFields.flatMap((field) => [
    { field, target: createTarget({ [field]: '' }) },
    { field, target: createTarget({ [field]: '   ' }) },
  ]);

  for (const { field, target } of invalidTargets) {
    const validate = () => validatePagesTargets([target]);

    assert.throws(validate, {
      name: 'TypeError',
      message: `Pages target ${field} must be a non-empty string.`,
    });
  }
});

test('formats a stable preview branch for a pull request', () => {
  const prNumber = 42;

  const branch = previewBranch(prNumber);

  assert.equal(branch, 'pr-42');
});

test('rejects invalid pull request numbers for preview branches', () => {
  const invalidPrNumbers = [0, -1, 1.5, '42', null, undefined, Number.NaN];

  for (const prNumber of invalidPrNumbers) {
    const formatBranch = () => previewBranch(prNumber);

    assert.throws(formatBranch, {
      name: 'TypeError',
      message: 'PR number must be a positive integer.',
    });
  }
});

test('formats a stable Cloudflare Pages preview URL', () => {
  const target = PAGES_TARGETS[0];
  const prNumber = 42;

  const url = previewUrl(target, prNumber);

  assert.equal(url, 'https://pr-42.hashbrown-www.pages.dev');
});

test('renders the preview comment marker exactly once', () => {
  const results = [{ targetId: 'docs', status: 'success' }];

  const comment = renderPreviewComment({
    headSha: 'abcdef123456',
    prNumber: 42,
    results,
  });
  const markerMatches = comment.match(/<!-- hashbrown-cloudflare-preview -->/g);

  assert.equal(PREVIEW_COMMENT_MARKER, '<!-- hashbrown-cloudflare-preview -->');
  assert.equal(markerMatches?.length, 1);
});

test('renders preview results in Pages target manifest order', () => {
  const results = [
    { targetId: 'smart-home', status: 'success' },
    { targetId: 'docs', status: 'success' },
    { targetId: 'fast-food', status: 'success' },
  ];

  const comment = renderPreviewComment({
    headSha: 'abcdef123456',
    prNumber: 42,
    results,
  });

  assert.ok(comment.indexOf('| Docs |') < comment.indexOf('| Fast Food |'));
  assert.ok(
    comment.indexOf('| Fast Food |') < comment.indexOf('| Smart Home |'),
  );
});

test('renders successful results with stable linked preview URLs', () => {
  const results = [{ targetId: 'docs', status: 'success' }];

  const comment = renderPreviewComment({
    headSha: 'abcdef123456',
    prNumber: 42,
    results,
  });

  assert.match(
    comment,
    /\| Docs \| Ready \| \[[^\]]+\]\(https:\/\/pr-42\.hashbrown-www\.pages\.dev\) \|/,
  );
});

test('renders failed results without preview links', () => {
  const results = [
    { targetId: 'finance', status: 'deploy-failed' },
    { targetId: 'docs', status: 'build-failed' },
  ];

  const comment = renderPreviewComment({
    headSha: 'abcdef123456',
    prNumber: 42,
    results,
  });
  const docsRow = comment
    .split('\n')
    .find((line) => line.startsWith('| Docs |'));
  const financeRow = comment
    .split('\n')
    .find((line) => line.startsWith('| Finance |'));

  assert.equal(docsRow, '| Docs | Build failed | |');
  assert.equal(financeRow, '| Finance | Deployment failed | |');
  assert.doesNotMatch(docsRow, /https:\/\//);
  assert.doesNotMatch(financeRow, /https:\/\//);
});

test('renders the seven-character head SHA above the results table', () => {
  const results = [{ targetId: 'docs', status: 'success' }];

  const comment = renderPreviewComment({
    headSha: 'abcdef123456',
    prNumber: 42,
    results,
  });

  assert.ok(comment.indexOf('`abcdef1`') < comment.indexOf('| Site |'));
  assert.doesNotMatch(comment, /abcdef12/);
});

test('rejects preview results with unknown target ids', () => {
  const results = [{ targetId: 'unknown', status: 'success' }];

  const render = () =>
    renderPreviewComment({
      headSha: 'abcdef123456',
      prNumber: 42,
      results,
    });

  assert.throws(render, {
    name: 'TypeError',
    message: 'Unknown Pages target id: unknown.',
  });
});

test('rejects preview results with unknown statuses', () => {
  const unknownStatuses = ['pending', 'toString'];

  for (const status of unknownStatuses) {
    const results = [{ targetId: 'docs', status }];
    const render = () =>
      renderPreviewComment({
        headSha: 'abcdef123456',
        prNumber: 42,
        results,
      });

    assert.throws(render, {
      name: 'TypeError',
      message: `Unknown preview result status: ${status}.`,
    });
  }
});

test('does not mutate preview results while rendering in manifest order', () => {
  const results = Object.freeze([
    Object.freeze({ targetId: 'finance', status: 'deploy-failed' }),
    Object.freeze({ targetId: 'docs', status: 'success' }),
  ]);

  renderPreviewComment({
    headSha: 'abcdef123456',
    prNumber: 42,
    results,
  });

  assert.deepEqual(results, [
    { targetId: 'finance', status: 'deploy-failed' },
    { targetId: 'docs', status: 'success' },
  ]);
});
