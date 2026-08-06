const GLOBAL_INVALIDATOR_FILES = new Set([
  '.github/workflows/pr-main.yml',
  'nx.json',
  'package.json',
  'package-lock.json',
]);

const REQUIRED_TARGET_FIELDS = [
  'id',
  'displayName',
  'nxProject',
  'cloudflareProject',
  'outputDirectory',
];

const PREVIEW_RESULT_STATUS_LABELS = Object.freeze({
  success: 'Ready',
  'build-failed': 'Build failed',
  'deploy-failed': 'Deployment failed',
});

const CLOUDFLARE_PROJECT_PATTERN = /^[a-z0-9-]+$/;
const HEAD_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;
const NX_PROJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const OUTPUT_DIRECTORY_SEGMENT_PATTERN = /^[A-Za-z0-9._@-]+$/;

/** Returns whether a value is a plain object. */
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function validateCloudflareProject(cloudflareProject) {
  if (
    typeof cloudflareProject !== 'string' ||
    !CLOUDFLARE_PROJECT_PATTERN.test(cloudflareProject)
  ) {
    throw new TypeError(
      'Pages target cloudflareProject must be a lowercase Pages project slug.',
    );
  }
}

function validateNxProject(nxProject) {
  if (!NX_PROJECT_PATTERN.test(nxProject)) {
    throw new TypeError(
      'Pages target nxProject must be a safe Nx project name.',
    );
  }
}

function validateOutputDirectory(outputDirectory) {
  const segments = outputDirectory.split('/');
  const isUnsafe =
    outputDirectory.startsWith('-') ||
    outputDirectory.startsWith('/') ||
    outputDirectory.includes('\\') ||
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        !OUTPUT_DIRECTORY_SEGMENT_PATTERN.test(segment),
    );

  if (isUnsafe) {
    throw new TypeError(
      'Pages target outputDirectory must be a safe repository-relative path.',
    );
  }
}

/** Marker used to identify the Cloudflare preview pull request comment. */
export const PREVIEW_COMMENT_MARKER = '<!-- hashbrown-cloudflare-preview -->';

/** Ordered Cloudflare Pages deployment targets. */
export const PAGES_TARGETS = Object.freeze([
  Object.freeze({
    id: 'docs',
    displayName: 'Docs',
    nxProject: 'www',
    cloudflareProject: 'hashbrown-www',
    outputDirectory: 'dist/www/analog/analog/public',
  }),
  Object.freeze({
    id: 'finance',
    displayName: 'Finance',
    nxProject: 'finance-angular',
    cloudflareProject: 'hashbrown-finance',
    outputDirectory: 'dist/samples/finance/angular/browser',
  }),
  Object.freeze({
    id: 'fast-food',
    displayName: 'Fast Food',
    nxProject: 'fast-food-angular',
    cloudflareProject: 'hashbrown-fast-food',
    outputDirectory: 'dist/samples/fast-food/angular/browser',
  }),
  Object.freeze({
    id: 'smart-home',
    displayName: 'Smart Home',
    nxProject: 'smart-home-angular',
    cloudflareProject: 'hashbrown-smart-home',
    outputDirectory: 'dist/samples/smart-home/angular/browser',
  }),
]);

/** Validates that a Pages target manifest is complete and unambiguous. */
export function validatePagesTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new TypeError('Pages targets must be a non-empty array.');
  }

  const ids = new Set();
  const nxProjects = new Set();
  const cloudflareProjects = new Set();

  for (const target of targets) {
    for (const field of REQUIRED_TARGET_FIELDS) {
      if (typeof target?.[field] !== 'string' || target[field].trim() === '') {
        throw new TypeError(
          `Pages target ${field} must be a non-empty string.`,
        );
      }
    }

    validateCloudflareProject(target.cloudflareProject);
    validateNxProject(target.nxProject);
    validateOutputDirectory(target.outputDirectory);

    if (ids.has(target.id)) {
      throw new TypeError(`Duplicate Pages target id: ${target.id}.`);
    }

    if (nxProjects.has(target.nxProject)) {
      throw new TypeError(
        `Duplicate Pages target Nx project: ${target.nxProject}.`,
      );
    }

    if (cloudflareProjects.has(target.cloudflareProject)) {
      throw new TypeError(
        `Duplicate Pages deployment destination: ${target.cloudflareProject}.`,
      );
    }

    ids.add(target.id);
    nxProjects.add(target.nxProject);
    cloudflareProjects.add(target.cloudflareProject);
  }
}

validatePagesTargets(PAGES_TARGETS);

/** Selects ordered Pages targets affected by a change set. */
export function selectPreviewTargets({
  affectedProjects,
  changedFiles,
  targets = PAGES_TARGETS,
}) {
  const invalidatesAllTargets = changedFiles.some(
    (file) =>
      GLOBAL_INVALIDATOR_FILES.has(file) ||
      file.startsWith('tools/cloudflare/'),
  );

  if (invalidatesAllTargets) {
    return [...targets];
  }

  const affectedProjectSet = new Set(affectedProjects);

  return targets.filter((target) => affectedProjectSet.has(target.nxProject));
}

/** Returns the stable Cloudflare preview branch for a pull request. */
export function previewBranch(prNumber) {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new TypeError('PR number must be a positive integer.');
  }

  return `pr-${prNumber}`;
}

/** Returns the stable Cloudflare Pages branch alias URL for a target. */
export function previewUrl(target, prNumber) {
  if (!isPlainObject(target)) {
    throw new TypeError('Pages target must be a plain object.');
  }

  validateCloudflareProject(target.cloudflareProject);

  return `https://${previewBranch(prNumber)}.${target.cloudflareProject}.pages.dev`;
}

/** Renders ordered Cloudflare Pages preview results as a Markdown comment. */
export function renderPreviewComment({
  headSha,
  prNumber,
  results,
  targets = PAGES_TARGETS,
}) {
  validatePagesTargets(targets);
  previewBranch(prNumber);

  if (typeof headSha !== 'string' || !HEAD_SHA_PATTERN.test(headSha)) {
    throw new TypeError('Head SHA must be 7-64 hexadecimal characters.');
  }

  if (!Array.isArray(results) || results.length === 0) {
    throw new TypeError('Preview results must be a non-empty array.');
  }

  const targetIds = new Set();
  const resolvedResults = results.map((result, index) => {
    if (!isPlainObject(result)) {
      throw new TypeError(
        `Preview result at index ${index} must be a plain object.`,
      );
    }

    if (typeof result.targetId !== 'string' || result.targetId.trim() === '') {
      throw new TypeError(
        `Preview result at index ${index} targetId must be a non-empty string.`,
      );
    }

    if (!Object.hasOwn(PREVIEW_RESULT_STATUS_LABELS, result.status)) {
      throw new TypeError(
        `Unknown preview result status: ${String(result.status)}.`,
      );
    }

    const targetIndex = targets.findIndex(
      (target) => target.id === result.targetId,
    );

    if (targetIndex === -1) {
      throw new TypeError(`Unknown Pages target id: ${result.targetId}.`);
    }

    if (targetIds.has(result.targetId)) {
      throw new TypeError(
        `Duplicate preview result target id: ${result.targetId}.`,
      );
    }

    targetIds.add(result.targetId);

    return {
      result,
      target: targets[targetIndex],
      targetIndex,
    };
  });
  const orderedResults = resolvedResults.toSorted(
    (left, right) => left.targetIndex - right.targetIndex,
  );
  const rows = orderedResults.map(({ result, target }) => {
    const status = PREVIEW_RESULT_STATUS_LABELS[result.status];

    if (result.status !== 'success') {
      return `| ${target.displayName} | ${status} | |`;
    }

    return `| ${target.displayName} | ${status} | [Preview](${previewUrl(target, prNumber)}) |`;
  });

  return [
    PREVIEW_COMMENT_MARKER,
    `Commit: \`${headSha.slice(0, 7)}\``,
    '',
    '| Site | Status | Preview |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
}
