import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PAGES_TARGETS,
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

  assert.throws(validate);
});

test('rejects duplicate target ids', () => {
  const targets = [
    createTarget({ nxProject: 'first-app' }),
    createTarget({ nxProject: 'second-app' }),
  ];

  const validate = () => validatePagesTargets(targets);

  assert.throws(validate);
});

test('rejects duplicate target Nx projects', () => {
  const targets = [
    createTarget({ id: 'first' }),
    createTarget({ id: 'second' }),
  ];

  const validate = () => validatePagesTargets(targets);

  assert.throws(validate);
});

test('rejects targets with missing required fields', () => {
  const requiredFields = [
    'id',
    'displayName',
    'nxProject',
    'cloudflareProject',
    'outputDirectory',
  ];
  const targets = requiredFields.map((missingField) =>
    Object.fromEntries(
      Object.entries(createTarget()).filter(([field]) => field !== missingField),
    ),
  );

  const validations = targets.map(
    (target) => () => validatePagesTargets([target]),
  );

  for (const validate of validations) {
    assert.throws(validate);
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
  const targets = requiredFields.flatMap((field) => [
    createTarget({ [field]: '' }),
    createTarget({ [field]: '   ' }),
  ]);

  const validations = targets.map(
    (target) => () => validatePagesTargets([target]),
  );

  for (const validate of validations) {
    assert.throws(validate);
  }
});
