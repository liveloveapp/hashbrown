#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.nx',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
]);
const TRUSTED_PUBLISHER_REPOSITORY_URL =
  'https://github.com/liveloveapp/hashbrown.git';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function* walkProjectJsonFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        yield* walkProjectJsonFiles(join(directory, entry.name));
      }
      continue;
    }

    if (entry.isFile() && entry.name === 'project.json') {
      yield join(directory, entry.name);
    }
  }
}

async function findProjects(workspaceRoot) {
  const projects = new Map();

  for await (const projectJsonPath of walkProjectJsonFiles(workspaceRoot)) {
    const project = await readJson(projectJsonPath);
    if (typeof project.name === 'string') {
      projects.set(project.name, {
        name: project.name,
        root: projectJsonPath.slice(0, -'/project.json'.length),
        targets: project.targets ?? {},
      });
    }
  }

  return projects;
}

async function getPackageForProject(project) {
  const packageJsonPath = join(project.root, 'package.json');
  const packageJson = await readJson(packageJsonPath);

  return {
    packageJson,
    packageJsonPath,
    packageName: packageJson.name,
    projectName: project.name,
    version: packageJson.version,
  };
}

function normalizeTag(tag) {
  if (!tag) {
    return undefined;
  }

  return tag.replace(/^refs\/tags\//, '');
}

function getInternalDependencies(packageInfo) {
  const sections = [
    packageInfo.packageJson.dependencies,
    packageInfo.packageJson.peerDependencies,
    packageInfo.packageJson.optionalDependencies,
    packageInfo.packageJson.devDependencies,
  ];

  return sections.flatMap((dependencies) =>
    Object.entries(dependencies ?? {}).filter(([name]) =>
      name.startsWith('@hashbrownai/'),
    ),
  );
}

function getRepositoryUrl(packageJson) {
  if (typeof packageJson.repository === 'string') {
    return packageJson.repository;
  }

  return packageJson.repository?.url;
}

export async function verifyReleaseVersions({
  workspaceRoot = process.cwd(),
  expectedTag,
} = {}) {
  const nxJson = await readJson(join(workspaceRoot, 'nx.json'));
  const releaseProjects = nxJson.release?.projects;

  if (!Array.isArray(releaseProjects) || releaseProjects.length === 0) {
    throw new Error(
      'nx.json release.projects must list release package roots.',
    );
  }

  const projects = await findProjects(workspaceRoot);
  const releaseProjectRoots = new Set(releaseProjects);
  const releaseProjectNames = new Set(
    releaseProjects.map((projectRoot) =>
      projectRoot.replace(/^packages\//, ''),
    ),
  );
  const omittedPublicPackages = [];

  for (const project of projects.values()) {
    let packageInfo;

    try {
      packageInfo = await getPackageForProject(project);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    const isPublicHashbrownPackage =
      packageInfo.packageJson.private !== true &&
      typeof packageInfo.packageName === 'string' &&
      packageInfo.packageName.startsWith('@hashbrownai/');

    if (
      isPublicHashbrownPackage &&
      project.targets['nx-release-publish'] &&
      !releaseProjectNames.has(project.name)
    ) {
      omittedPublicPackages.push(packageInfo.packageName);
    }
  }

  if (omittedPublicPackages.length > 0) {
    omittedPublicPackages.sort((a, b) => a.localeCompare(b));
    throw new Error(
      omittedPublicPackages
        .map(
          (packageName) =>
            `Public package ${packageName} is not included in nx.json release.projects.`,
        )
        .join('\n'),
    );
  }

  const packages = [];

  for (const projectRoot of releaseProjectRoots) {
    const projectName = projectRoot.replace(/^packages\//, '');
    const project = projects.get(projectName);
    if (!project) {
      throw new Error(
        `Release project "${projectName}" does not have a project.json.`,
      );
    }

    const packageInfo = await getPackageForProject(project);
    const expectedPublishRoot = `dist/${projectRoot}`;
    const publishRoot =
      project.targets['nx-release-publish']?.options?.packageRoot;

    if (publishRoot !== expectedPublishRoot) {
      throw new Error(
        `Release project "${projectName}" must publish from ${expectedPublishRoot}.`,
      );
    }

    if (packageInfo.packageJson.private === true) {
      throw new Error(
        `Release project "${projectName}" points at private package ${relative(
          workspaceRoot,
          packageInfo.packageJsonPath,
        )}.`,
      );
    }

    if (
      typeof packageInfo.packageName !== 'string' ||
      typeof packageInfo.version !== 'string'
    ) {
      throw new Error(
        `Release project "${projectName}" must have package name and version in ${relative(
          workspaceRoot,
          packageInfo.packageJsonPath,
        )}.`,
      );
    }

    packages.push({
      packageJsonPath: packageInfo.packageJsonPath,
      packageName: packageInfo.packageName,
      projectName: packageInfo.projectName,
      publishConfigAccess: packageInfo.packageJson.publishConfig?.access,
      repositoryUrl: getRepositoryUrl(packageInfo.packageJson),
      version: packageInfo.version,
      internalDependencies: getInternalDependencies(packageInfo),
    });
  }

  packages.sort((a, b) => a.packageName.localeCompare(b.packageName));

  const versions = new Set(packages.map((pkg) => pkg.version));
  if (versions.size !== 1) {
    const packageList = packages
      .map((pkg) => `  - ${pkg.packageName}: ${pkg.version}`)
      .join('\n');

    throw new Error(
      `Hashbrown release packages must share one version.\n${packageList}`,
    );
  }

  const [version] = versions;
  const packageNames = new Set(packages.map((pkg) => pkg.packageName));

  for (const pkg of packages) {
    if (pkg.repositoryUrl !== TRUSTED_PUBLISHER_REPOSITORY_URL) {
      throw new Error(
        `${pkg.packageName} repository URL must be ${TRUSTED_PUBLISHER_REPOSITORY_URL} in ${relative(
          workspaceRoot,
          pkg.packageJsonPath,
        )}.`,
      );
    }

    if (pkg.publishConfigAccess !== 'public') {
      throw new Error(
        `${pkg.packageName} must set publishConfig.access to "public" in ${relative(
          workspaceRoot,
          pkg.packageJsonPath,
        )}.`,
      );
    }

    for (const [
      dependencyName,
      dependencyVersion,
    ] of pkg.internalDependencies) {
      if (packageNames.has(dependencyName) && dependencyVersion !== version) {
        throw new Error(
          `${pkg.packageName} depends on ${dependencyName} at ${dependencyVersion}, expected ${version}.`,
        );
      }
    }
  }

  const tag = normalizeTag(expectedTag);
  if (tag && tag !== `v${version}`) {
    throw new Error(
      `Release tag ${tag} does not match package version ${version}.`,
    );
  }

  return {
    version,
    packages: packages.map((pkg) => pkg.packageName),
  };
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tag') {
      options.expectedTag = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifyReleaseVersions(
      parseArgs(process.argv.slice(2)),
    );
    console.log(
      `Hashbrown release is atomic at ${result.version}: ${result.packages.join(', ')}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
