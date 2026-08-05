import {
  PAGES_TARGETS,
  previewBranch,
  renderPreviewComment,
  selectPreviewTargets,
  validatePagesTargets,
} from './deployment.mjs';

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;
const SUPERSEDED_RESULT = Object.freeze({ status: 'superseded' });
const NO_TARGETS_RESULT = Object.freeze({ status: 'no-targets' });

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

function createFailureError(failures) {
  const details = failures
    .map(
      ({ target, operation, error }) =>
        `${target.displayName} ${operation}: ${error}`,
    )
    .join('; ');

  return new Error(`Cloudflare preview deployment failed: ${details}`);
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
    throw createFailureError(failures);
  }

  return Object.freeze({ status: 'success', results: previewResults });
}
