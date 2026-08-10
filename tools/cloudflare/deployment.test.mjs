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
  productionUrl: 'https://example.hashbrown.dev',
  smokePath: '/',
  smokeText: '<title>Example</title>',
  ...overrides,
});

test('defines the ordered Pages deployment manifest', () => {
  const expectedTargets = [
    {
      id: 'docs',
      displayName: 'Docs',
      nxProject: 'www',
      cloudflareProject: 'hashbrown-www',
      outputDirectory: 'dist/www/analog',
      productionUrl: 'https://hashbrown.dev',
      smokePath: '/docs/angular/start/quick',
      smokeText: 'Angular Quick Start',
      wranglerConfigDirectory: 'www/analog',
    },
    {
      id: 'finance',
      displayName: 'Finance',
      nxProject: 'finance-angular',
      cloudflareProject: 'hashbrown-finance',
      outputDirectory: 'dist/samples/finance/angular/browser',
      productionUrl: 'https://finance.hashbrown.dev',
      smokePath: '/',
      smokeText: '<title>Finance Sample</title>',
    },
    {
      id: 'fast-food',
      displayName: 'Fast Food',
      nxProject: 'fast-food-angular',
      cloudflareProject: 'hashbrown-fast-food',
      outputDirectory: 'dist/samples/fast-food/angular/browser',
      productionUrl: 'https://fast-food.hashbrown.dev',
      smokePath: '/',
      smokeText: '<title>Fast Food Nutrition Sample</title>',
    },
    {
      id: 'smart-home',
      displayName: 'Smart Home',
      nxProject: 'smart-home-angular',
      cloudflareProject: 'hashbrown-smart-home',
      outputDirectory: 'dist/samples/smart-home/angular/browser',
      productionUrl: 'https://smart-home.hashbrown.dev',
      smokePath: '/',
      smokeText: '<title>Smart Home</title>',
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

test('rejects duplicate production deployment URLs', () => {
  const targets = [
    createTarget({
      id: 'first',
      nxProject: 'first-app',
      cloudflareProject: 'hashbrown-first',
    }),
    createTarget({
      id: 'second',
      nxProject: 'second-app',
      cloudflareProject: 'hashbrown-second',
    }),
  ];

  const validate = () => validatePagesTargets(targets);

  assert.throws(validate, {
    name: 'TypeError',
    message:
      'Duplicate Pages production deployment destination: https://example.hashbrown.dev.',
  });
});

test('rejects targets with missing required fields', () => {
  const requiredFields = [
    'id',
    'displayName',
    'nxProject',
    'cloudflareProject',
    'outputDirectory',
    'productionUrl',
    'smokePath',
    'smokeText',
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
    'productionUrl',
    'smokePath',
    'smokeText',
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

test('rejects invalid Cloudflare Pages project slugs in target manifests', () => {
  const invalidSlugs = ['Hashbrown-example', 'hashbrown_example'];

  for (const cloudflareProject of invalidSlugs) {
    const validate = () =>
      validatePagesTargets([createTarget({ cloudflareProject })]);

    assert.throws(validate, {
      name: 'TypeError',
      message:
        'Pages target cloudflareProject must be a lowercase Pages project slug.',
    });
  }
});

test('rejects unsafe Nx project command arguments in target manifests', () => {
  const invalidProjects = [
    '-example',
    'example app',
    '../example',
    'example/app',
    '@scope/example',
    'example?configuration=unsafe',
  ];

  for (const nxProject of invalidProjects) {
    const validate = () => validatePagesTargets([createTarget({ nxProject })]);

    assert.throws(validate, {
      name: 'TypeError',
      message: 'Pages target nxProject must be a safe Nx project name.',
    });
  }
});

test('rejects unsafe output directories in target manifests', () => {
  const invalidDirectories = [
    '-dist/example',
    '/dist/example',
    'C:\\dist\\example',
    'dist\\example',
    '.',
    '..',
    'dist/../example',
    'dist/./example',
    'dist//example',
    'dist/example?configuration=unsafe',
  ];

  for (const outputDirectory of invalidDirectories) {
    const validate = () =>
      validatePagesTargets([createTarget({ outputDirectory })]);

    assert.throws(validate, {
      name: 'TypeError',
      message:
        'Pages target outputDirectory must be a safe repository-relative path.',
    });
  }
});

test('rejects unsafe Wrangler config directories in target manifests', () => {
  const invalidDirectories = [
    '',
    '-www/analog',
    '/www/analog',
    'www\\analog',
    '.',
    '..',
    'www/../analog',
    'www/./analog',
    'www//analog',
  ];

  for (const wranglerConfigDirectory of invalidDirectories) {
    const validate = () =>
      validatePagesTargets([createTarget({ wranglerConfigDirectory })]);

    assert.throws(validate, {
      name: 'TypeError',
      message:
        'Pages target wranglerConfigDirectory must be a safe repository-relative path.',
    });
  }
});

test('rejects invalid production URLs in target manifests', () => {
  const invalidUrls = [
    'http://example.hashbrown.dev',
    'https://user@example.hashbrown.dev',
    'https://example.hashbrown.dev:4443',
    'https://example.hashbrown.dev/path',
    'https://example.hashbrown.dev?preview=true',
    'https://example.hashbrown.dev#fragment',
    'https://example.com',
    'not-a-url',
  ];

  for (const productionUrl of invalidUrls) {
    const validate = () =>
      validatePagesTargets([createTarget({ productionUrl })]);

    assert.throws(validate, {
      name: 'TypeError',
      message:
        'Pages target productionUrl must be an HTTPS hashbrown.dev origin.',
    });
  }
});

test('rejects unsafe smoke paths in target manifests', () => {
  const invalidPaths = [
    'docs/start',
    '//example.com/path',
    '/docs/../admin',
    '/docs?preview=true',
    '/docs#fragment',
    '/docs\\start',
  ];

  for (const smokePath of invalidPaths) {
    const validate = () => validatePagesTargets([createTarget({ smokePath })]);

    assert.throws(validate, {
      name: 'TypeError',
      message: 'Pages target smokePath must be a safe absolute path.',
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

test('rejects missing or malformed Pages targets for preview URLs', () => {
  const malformedTargets = [undefined, null, 'docs', [], new Date(0)];

  for (const target of malformedTargets) {
    const formatUrl = () => previewUrl(target, 42);

    assert.throws(formatUrl, {
      name: 'TypeError',
      message: 'Pages target must be a plain object.',
    });
  }
});

test('rejects invalid Cloudflare Pages project slugs for preview URLs', () => {
  const invalidSlugs = [
    undefined,
    null,
    '',
    '   ',
    'Hashbrown-www',
    'hashbrown_www',
  ];

  for (const cloudflareProject of invalidSlugs) {
    const target = { cloudflareProject };
    const formatUrl = () => previewUrl(target, 42);

    assert.throws(formatUrl, {
      name: 'TypeError',
      message:
        'Pages target cloudflareProject must be a lowercase Pages project slug.',
    });
  }
});

test('rejects invalid head SHAs for preview comments', () => {
  const invalidHeadShas = [
    undefined,
    '',
    'abcdef',
    'a'.repeat(65),
    'abcdef\n1',
    'abcdef`1',
    'abcdefg',
  ];

  for (const headSha of invalidHeadShas) {
    const render = () =>
      renderPreviewComment({
        headSha,
        prNumber: 42,
        results: [{ targetId: 'docs', status: 'success' }],
      });

    assert.throws(render, {
      name: 'TypeError',
      message: 'Head SHA must be 7-64 hexadecimal characters.',
    });
  }
});

test('rejects non-array preview results', () => {
  const invalidResults = [undefined, null, 'results', {}];

  for (const results of invalidResults) {
    const render = () =>
      renderPreviewComment({
        headSha: 'abcdef123456',
        prNumber: 42,
        results,
      });

    assert.throws(render, {
      name: 'TypeError',
      message: 'Preview results must be a non-empty array.',
    });
  }
});

test('rejects empty preview results', () => {
  const results = [];

  const render = () =>
    renderPreviewComment({
      headSha: 'abcdef123456',
      prNumber: 42,
      results,
    });

  assert.throws(render, {
    name: 'TypeError',
    message: 'Preview results must be a non-empty array.',
  });
});

test('rejects null or malformed preview result entries', () => {
  const malformedResults = [null, 'docs', [], new Date(0)];

  for (const result of malformedResults) {
    const render = () =>
      renderPreviewComment({
        headSha: 'abcdef123456',
        prNumber: 42,
        results: [result],
      });

    assert.throws(render, {
      name: 'TypeError',
      message: 'Preview result at index 0 must be a plain object.',
    });
  }
});

test('rejects preview results with missing or empty target ids', () => {
  const invalidTargetIds = [undefined, null, '', '   ', 42];

  for (const targetId of invalidTargetIds) {
    const render = () =>
      renderPreviewComment({
        headSha: 'abcdef123456',
        prNumber: 42,
        results: [{ targetId, status: 'success' }],
      });

    assert.throws(render, {
      name: 'TypeError',
      message: 'Preview result at index 0 targetId must be a non-empty string.',
    });
  }
});

test('rejects duplicate preview result target ids', () => {
  const results = [
    { targetId: 'docs', status: 'success' },
    { targetId: 'docs', status: 'build-failed' },
  ];

  const render = () =>
    renderPreviewComment({
      headSha: 'abcdef123456',
      prNumber: 42,
      results,
    });

  assert.throws(render, {
    name: 'TypeError',
    message: 'Duplicate preview result target id: docs.',
  });
});

test('validates preview comment pull request numbers before rendering failures', () => {
  const results = [
    { targetId: 'docs', status: 'build-failed' },
    { targetId: 'finance', status: 'deploy-failed' },
  ];

  const render = () =>
    renderPreviewComment({
      headSha: 'abcdef123456',
      prNumber: 0,
      results,
    });

  assert.throws(render, {
    name: 'TypeError',
    message: 'PR number must be a positive integer.',
  });
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

test('renders preview results against an injected target manifest', () => {
  const targets = Object.freeze([
    Object.freeze(
      createTarget({
        id: 'first',
        displayName: 'First App',
        nxProject: 'first-app',
        cloudflareProject: 'hashbrown-first',
        productionUrl: 'https://first.hashbrown.dev',
      }),
    ),
    Object.freeze(
      createTarget({
        id: 'second',
        displayName: 'Second App',
        nxProject: 'second-app',
        cloudflareProject: 'hashbrown-second',
        productionUrl: 'https://second.hashbrown.dev',
      }),
    ),
  ]);
  const results = [
    { targetId: 'second', status: 'success' },
    { targetId: 'first', status: 'success' },
  ];

  const comment = renderPreviewComment({
    headSha: 'abcdef123456',
    prNumber: 42,
    results,
    targets,
  });

  assert.ok(
    comment.indexOf('| First App |') < comment.indexOf('| Second App |'),
  );
  assert.match(comment, /https:\/\/pr-42\.hashbrown-first\.pages\.dev/);
  assert.match(comment, /https:\/\/pr-42\.hashbrown-second\.pages\.dev/);
  assert.deepEqual(targets, [
    createTarget({
      id: 'first',
      displayName: 'First App',
      nxProject: 'first-app',
      cloudflareProject: 'hashbrown-first',
      productionUrl: 'https://first.hashbrown.dev',
    }),
    createTarget({
      id: 'second',
      displayName: 'Second App',
      nxProject: 'second-app',
      cloudflareProject: 'hashbrown-second',
      productionUrl: 'https://second.hashbrown.dev',
    }),
  ]);
});

test('validates an injected target manifest before rendering', () => {
  const render = () =>
    renderPreviewComment({
      headSha: 'abcdef123456',
      prNumber: 42,
      results: [{ targetId: 'docs', status: 'success' }],
      targets: [],
    });

  assert.throws(render, {
    name: 'TypeError',
    message: 'Pages targets must be a non-empty array.',
  });
});

test('renders an exact ordered preview comment for mixed results', () => {
  const results = [
    { targetId: 'smart-home', status: 'deploy-failed' },
    { targetId: 'finance', status: 'build-failed' },
    { targetId: 'docs', status: 'success' },
  ];

  const comment = renderPreviewComment({
    headSha: 'abcdef123456',
    prNumber: 42,
    results,
  });

  assert.equal(
    comment,
    `<!-- hashbrown-cloudflare-preview -->
Commit: \`abcdef1\`

| Site | Status | Preview |
| --- | --- | --- |
| Docs | Ready | [Preview](https://pr-42.hashbrown-www.pages.dev) |
| Finance | Build failed | |
| Smart Home | Deployment failed | |`,
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

test('renders a smoke-failed preview with its stable URL', () => {
  const comment = renderPreviewComment({
    headSha: 'abcdef123456',
    prNumber: 42,
    results: [{ targetId: 'smart-home', status: 'smoke-failed' }],
  });

  assert.match(
    comment,
    /\| Smart Home \| Smoke test failed \| \[Preview\]\(https:\/\/pr-42\.hashbrown-smart-home\.pages\.dev\) \|/,
  );
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
  const unknownStatuses = [undefined, 'pending', 'toString'];

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
