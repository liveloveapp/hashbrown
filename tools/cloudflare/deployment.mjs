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
