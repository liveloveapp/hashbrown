import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  PAGES_TARGETS,
  PREVIEW_COMMENT_MARKER,
  previewBranch,
  renderPreviewComment,
  selectPreviewTargets,
  validatePagesTargets,
} from './deployment.mjs';

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;
const SUPERSEDED_RESULT = Object.freeze({ status: 'superseded' });
const NO_TARGETS_RESULT = Object.freeze({ status: 'no-targets' });
const PRODUCTION_STATUS_LABELS = Object.freeze({
  success: 'Ready',
  'build-failed': 'Build failed',
  'deployment-skipped': 'Deployment skipped',
  'deploy-failed': 'Deployment failed',
});
const GITHUB_API_BASE_URL = 'https://api.github.com';

function validateCommitSha(name, sha) {
  if (typeof sha !== 'string' || !COMMIT_SHA_PATTERN.test(sha)) {
    throw new TypeError(`${name} SHA must be 7-64 hexadecimal characters.`);
  }
}

function freezeResults(results) {
  return Object.freeze(results.map((result) => Object.freeze(result)));
}

function renderSummary(body) {
  return `## Cloudflare previews\n\n${body}`;
}

function createFailureError(environment, failures) {
  const details = failures
    .map(
      ({ target, operation, error }) =>
        `${target.displayName} ${operation}: ${error}`,
    )
    .join('; ');

  return new Error(`Cloudflare ${environment} deployment failed: ${details}`);
}

function renderProductionSummary(results, targets) {
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const rows = results.map((result) => {
    const target = targetById.get(result.targetId);

    return `| ${target.displayName} | ${PRODUCTION_STATUS_LABELS[result.status]} |`;
  });

  return [
    '## Cloudflare production',
    '',
    '| Site | Status |',
    '| --- | --- |',
    ...rows,
  ].join('\n');
}

function processFailure(command, args, detail) {
  return Object.freeze({
    ok: false,
    error: `${command} ${args.join(' ')}: ${detail}`,
  });
}

function assertProcessSucceeded(result, label) {
  if (!result.ok) {
    throw new Error(`${label}: ${result.error}`);
  }

  return result;
}

function validateNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function validateCliSha(name, value) {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/i.test(value)) {
    throw new TypeError(`${name} must contain hexadecimal characters only.`);
  }
}

function validatePositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

function validateGitHubRepository(repository) {
  if (
    typeof repository !== 'string' ||
    !/^[^/\s]+\/[^/\s]+$/.test(repository)
  ) {
    throw new TypeError('GitHub repository must use the owner/name format.');
  }
}

/** Builds, deploys, and reports affected pull request previews. */
export async function runPreviewDeployment(
  { baseSha, headSha, prNumber, targets = PAGES_TARGETS },
  dependencies,
) {
  validatePagesTargets(targets);
  validateCommitSha('Base', baseSha);
  validateCommitSha('Head', headSha);
  const branch = previewBranch(prNumber);

  const currentHeadSha = await dependencies.getPullRequestHead(prNumber);

  if (currentHeadSha !== headSha) {
    return SUPERSEDED_RESULT;
  }

  const range = { baseSha, headSha };
  const affectedProjects = await dependencies.listAffectedProjects(range);
  const changedFiles = await dependencies.listChangedFiles(range);
  const selectedTargets = selectPreviewTargets({
    affectedProjects,
    changedFiles,
    targets,
  });

  if (selectedTargets.length === 0) {
    const latestHeadSha = await dependencies.getPullRequestHead(prNumber);

    if (latestHeadSha !== headSha) {
      return SUPERSEDED_RESULT;
    }

    const comment = await dependencies.findPreviewComment(prNumber);
    const mutationHeadSha = await dependencies.getPullRequestHead(prNumber);

    if (mutationHeadSha !== headSha) {
      return SUPERSEDED_RESULT;
    }

    if (comment !== null) {
      await dependencies.deletePreviewComment(comment.id);
    }

    return NO_TARGETS_RESULT;
  }

  const results = [];
  const failures = [];

  for (const target of selectedTargets) {
    const buildResult = await dependencies.buildTarget(target);

    if (!buildResult.ok) {
      results.push({ targetId: target.id, status: 'build-failed' });
      failures.push({
        target,
        operation: 'build',
        error: buildResult.error,
      });
      continue;
    }

    const deployResult = await dependencies.deployTarget({
      target,
      branch,
      sha: headSha,
    });

    if (!deployResult.ok) {
      results.push({ targetId: target.id, status: 'deploy-failed' });
      failures.push({
        target,
        operation: 'deploy',
        error: deployResult.error,
      });
      continue;
    }

    results.push({ targetId: target.id, status: 'success' });
  }

  const previewResults = freezeResults(results);
  const latestHeadSha = await dependencies.getPullRequestHead(prNumber);

  if (latestHeadSha !== headSha) {
    return SUPERSEDED_RESULT;
  }

  const body = renderPreviewComment({
    headSha,
    prNumber,
    results: previewResults,
    targets,
  });
  const comment = await dependencies.findPreviewComment(prNumber);
  const mutationHeadSha = await dependencies.getPullRequestHead(prNumber);

  if (mutationHeadSha !== headSha) {
    return SUPERSEDED_RESULT;
  }

  if (comment === null) {
    await dependencies.createPreviewComment({ prNumber, body });
  } else {
    await dependencies.updatePreviewComment({ commentId: comment.id, body });
  }

  await dependencies.appendSummary(renderSummary(body));

  if (failures.length > 0) {
    throw createFailureError('preview', failures);
  }

  return Object.freeze({ status: 'success', results: previewResults });
}

/** Builds and deploys every production Pages target in manifest order. */
export async function runProductionDeployment(
  { sha, targets = PAGES_TARGETS },
  dependencies,
) {
  validatePagesTargets(targets);
  validateCommitSha('Production', sha);

  const buildResults = [];
  const failures = [];

  for (const target of targets) {
    const buildResult = await dependencies.buildTarget(target);

    if (!buildResult.ok) {
      buildResults.push({ targetId: target.id, status: 'build-failed' });
      failures.push({
        target,
        operation: 'build',
        error: buildResult.error,
      });
      continue;
    }

    buildResults.push({ targetId: target.id, status: 'deployment-skipped' });
  }

  if (failures.length > 0) {
    const productionResults = freezeResults(buildResults);
    await dependencies.appendSummary(
      renderProductionSummary(productionResults, targets),
    );
    throw createFailureError('production', failures);
  }

  const deploymentResults = [];

  for (const target of targets) {
    const deployResult = await dependencies.deployTarget({
      target,
      branch: 'main',
      sha,
    });

    if (!deployResult.ok) {
      deploymentResults.push({
        targetId: target.id,
        status: 'deploy-failed',
      });
      failures.push({
        target,
        operation: 'deploy',
        error: deployResult.error,
      });
      continue;
    }

    deploymentResults.push({ targetId: target.id, status: 'success' });
  }

  const productionResults = freezeResults(deploymentResults);
  await dependencies.appendSummary(
    renderProductionSummary(productionResults, targets),
  );

  if (failures.length > 0) {
    throw createFailureError('production', failures);
  }

  return Object.freeze({ status: 'success', results: productionResults });
}

/** Parses the strict Cloudflare deployment command-line interface. */
export function parseDeployArgs(argv) {
  if (!Array.isArray(argv)) {
    throw new TypeError('Deployment arguments must be an array.');
  }

  if (
    argv.length === 7 &&
    argv[0] === 'preview' &&
    argv[1] === '--base' &&
    argv[3] === '--head' &&
    argv[5] === '--pr'
  ) {
    validateCliSha('Base SHA', argv[2]);
    validateCliSha('Head SHA', argv[4]);
    const prNumber = Number(argv[6]);
    validatePositiveInteger('PR number', prNumber);

    if (String(prNumber) !== argv[6]) {
      throw new TypeError('PR number must be a positive integer.');
    }

    return Object.freeze({
      mode: 'preview',
      baseSha: argv[2],
      headSha: argv[4],
      prNumber,
    });
  }

  if (argv.length === 3 && argv[0] === 'production' && argv[1] === '--sha') {
    validateCliSha('Production SHA', argv[2]);

    return Object.freeze({ mode: 'production', sha: argv[2] });
  }

  throw new TypeError('Invalid Cloudflare deployment arguments.');
}

/** Returns the argument array for an Nx affected-project query. */
export function nxAffectedArgs({ baseSha, headSha }) {
  validateNonEmptyString('Base SHA', baseSha);
  validateNonEmptyString('Head SHA', headSha);

  return Object.freeze([
    'nx',
    'show',
    'projects',
    '--affected',
    `--base=${baseSha}`,
    `--head=${headSha}`,
    '--withTarget=build',
    '--type=app',
    '--json',
  ]);
}

/** Returns the safe argument array for a Wrangler Pages deployment. */
export function wranglerDeployArgs(target, { branch, sha }) {
  validatePagesTargets([target]);
  validateNonEmptyString('Cloudflare branch', branch);
  validateNonEmptyString('Commit SHA', sha);

  return Object.freeze([
    'wrangler',
    'pages',
    'deploy',
    target.outputDirectory,
    `--project-name=${target.cloudflareProject}`,
    `--branch=${branch}`,
    `--commit-hash=${sha}`,
    '--commit-dirty=true',
  ]);
}

/** Creates a spawn-based subprocess runner with normalized result objects. */
export function createSubprocessRunner(spawnImpl = spawn) {
  if (typeof spawnImpl !== 'function') {
    throw new TypeError('spawnImpl must be a function.');
  }

  return async function runSubprocess(command, args, options = {}) {
    validateNonEmptyString('Command', command);

    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
      throw new TypeError('Command arguments must be an array of strings.');
    }

    return new Promise((resolveResult) => {
      let child;

      try {
        child = spawnImpl(command, args, {
          cwd: options.cwd ?? process.cwd(),
          env: options.env ?? process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        resolveResult(processFailure(command, args, error.message));
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      const settle = (result) => {
        if (!settled) {
          settled = true;
          resolveResult(result);
        }
      };

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        settle(processFailure(command, args, error.message));
      });
      child.on('close', (code) => {
        if (code === 0) {
          settle(Object.freeze({ ok: true, stdout, stderr }));
          return;
        }

        const detail = stderr.trim() || `process exited with code ${code}`;
        settle(processFailure(command, args, detail));
      });
    });
  };
}

/** Creates a minimal GitHub client for preview-head and comment operations. */
export function createGitHubClient({ fetchImpl, token, repository }) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl must be a function.');
  }

  validateNonEmptyString('GitHub token', token);
  validateGitHubRepository(repository);

  const request = async (method, path, body) => {
    const response = await fetchImpl(
      `${GITHUB_API_BASE_URL}/repos/${repository}${path}`,
      {
        method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `GitHub ${method} ${path} failed with ${response.status}.`,
      );
    }

    return response;
  };

  return Object.freeze({
    async getPullRequestHead(prNumber) {
      validatePositiveInteger('PR number', prNumber);
      const response = await request('GET', `/pulls/${prNumber}`);
      const payload = await response.json();

      if (
        typeof payload?.head?.sha !== 'string' ||
        !COMMIT_SHA_PATTERN.test(payload.head.sha)
      ) {
        throw new TypeError('Malformed GitHub pull request response.');
      }

      return payload.head.sha;
    },

    async findPreviewComment(prNumber) {
      validatePositiveInteger('PR number', prNumber);
      let page = 1;

      while (true) {
        const path = `/issues/${prNumber}/comments?per_page=100&page=${page}`;
        const response = await request('GET', path);
        const comments = await response.json();

        if (!Array.isArray(comments)) {
          throw new TypeError('Malformed GitHub comments response.');
        }

        const comment = comments.find(
          (candidate) =>
            candidate?.user?.login === 'github-actions[bot]' &&
            typeof candidate.body === 'string' &&
            candidate.body.includes(PREVIEW_COMMENT_MARKER) &&
            Number.isInteger(candidate.id) &&
            candidate.id > 0,
        );

        if (comment) {
          return Object.freeze({ id: comment.id });
        }

        if (comments.length < 100) {
          return null;
        }

        page += 1;
      }
    },

    async createPreviewComment({ prNumber, body }) {
      validatePositiveInteger('PR number', prNumber);
      validateNonEmptyString('Preview comment body', body);
      await request('POST', `/issues/${prNumber}/comments`, { body });
    },

    async updatePreviewComment({ commentId, body }) {
      validatePositiveInteger('Comment id', commentId);
      validateNonEmptyString('Preview comment body', body);
      await request('PATCH', `/issues/comments/${commentId}`, { body });
    },

    async deletePreviewComment(commentId) {
      validatePositiveInteger('Comment id', commentId);
      await request('DELETE', `/issues/comments/${commentId}`);
    },
  });
}

/** Creates concrete process, GitHub, and Actions-summary deployment adapters. */
export function createRuntimeDependencies({
  spawnImpl = spawn,
  fetchImpl = globalThis.fetch,
  appendFileImpl = appendFile,
  env = process.env,
} = {}) {
  validateNonEmptyString('GITHUB_STEP_SUMMARY', env.GITHUB_STEP_SUMMARY);
  const runSubprocess = createSubprocessRunner(spawnImpl);
  let github;
  const getGitHub = () => {
    github ??= createGitHubClient({
      fetchImpl,
      token: env.GITHUB_TOKEN,
      repository: env.GITHUB_REPOSITORY,
    });

    return github;
  };

  return Object.freeze({
    async listAffectedProjects(range) {
      const result = assertProcessSucceeded(
        await runSubprocess('npx', nxAffectedArgs(range)),
        'Nx affected projects failed',
      );

      let projects;

      try {
        projects = JSON.parse(result.stdout);
      } catch {
        throw new TypeError('Nx affected projects returned invalid JSON.');
      }

      if (
        !Array.isArray(projects) ||
        projects.some((project) => typeof project !== 'string')
      ) {
        throw new TypeError('Nx affected projects returned invalid JSON.');
      }

      return Object.freeze([...projects]);
    },

    async listChangedFiles({ baseSha, headSha }) {
      validateNonEmptyString('Base SHA', baseSha);
      validateNonEmptyString('Head SHA', headSha);
      const result = assertProcessSucceeded(
        await runSubprocess('git', [
          'diff',
          '--name-only',
          `${baseSha}...${headSha}`,
        ]),
        'Changed-file lookup failed',
      );
      const files = result.stdout
        .split('\n')
        .map((file) => file.trim())
        .filter(Boolean);

      return Object.freeze(files);
    },

    buildTarget(target) {
      return runSubprocess('npx', [
        'nx',
        'build',
        target.nxProject,
        '--configuration=production',
      ]);
    },

    deployTarget({ target, branch, sha }) {
      return runSubprocess('npx', wranglerDeployArgs(target, { branch, sha }));
    },

    async getPullRequestHead(prNumber) {
      return getGitHub().getPullRequestHead(prNumber);
    },

    async findPreviewComment(prNumber) {
      return getGitHub().findPreviewComment(prNumber);
    },

    async createPreviewComment(comment) {
      return getGitHub().createPreviewComment(comment);
    },

    async updatePreviewComment(comment) {
      return getGitHub().updatePreviewComment(comment);
    },

    async deletePreviewComment(commentId) {
      return getGitHub().deletePreviewComment(commentId);
    },

    appendSummary(summary) {
      validateNonEmptyString('Deployment summary', summary);
      return appendFileImpl(env.GITHUB_STEP_SUMMARY, `${summary}\n`, 'utf8');
    },
  });
}

/** Parses and executes one Cloudflare deployment CLI command. */
export function executeDeployCommand(argv, dependencies) {
  const command = parseDeployArgs(argv);

  if (command.mode === 'preview') {
    return runPreviewDeployment(command, dependencies);
  }

  return runProductionDeployment(command, dependencies);
}

async function main() {
  try {
    await executeDeployCommand(
      process.argv.slice(2),
      createRuntimeDependencies(),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
