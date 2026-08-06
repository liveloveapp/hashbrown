# Cloudflare Deployment Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing PR/Main CI workflow publish affected pull request previews with sticky comments and automatically deploy every Cloudflare Pages site from validated pushes to `main`.

**Architecture:** A dependency-free Node module owns the Pages manifest and pure selection/comment logic, while a separate Node runner owns Nx, Wrangler, GitHub API, and Actions-summary side effects. The existing PR/Main workflow becomes the only deployment trigger, with workflow-level concurrency, a stable PR gate, and package publishing fully decoupled from Cloudflare.

**Tech Stack:** GitHub Actions, Nx 21, Node.js 24 ESM, Node's built-in test runner, Wrangler 4, Cloudflare Pages, GitHub REST API.

---

## File Map

- Create `tools/cloudflare/project.json`: register the deployment tooling as the `cloudflare-deployment` Nx project with an explicit test target.
- Create `tools/cloudflare/deployment.mjs`: immutable Pages manifest plus pure target-selection, branch/URL, result-ordering, and comment-rendering functions.
- Create `tools/cloudflare/deployment.test.mjs`: top-level unit tests for the pure deployment contract.
- Create `tools/cloudflare/deploy.mjs`: dependency-injected preview/production orchestration and concrete Nx, Git, Wrangler, GitHub API, and Actions-summary adapters.
- Create `tools/cloudflare/deploy.test.mjs`: top-level orchestration and CLI tests using fake dependencies; no network or Cloudflare calls.
- Modify `.github/workflows/pr-main.yml`: add workflow-level concurrency, always-run deployment-tool tests, downstream preview/production jobs, and the stable `PR Gate`.
- Modify `.github/workflows/npm-publish.yml`: remove Cloudflare deployment coupling.
- Delete `.github/workflows/cloudflare-preview.yml`: replace its push-to-main preview behavior with PR previews.
- Delete `.github/workflows/cloudflare-production.yml`: move production deployment into PR/Main CI.
- Delete `scripts/deploy-smoke.mjs`: remove the now-unused production HTTP smoke helper.
- Delete `scripts/deploy-smoke.spec.mjs`: remove tests for the deleted helper.
- Modify `www/analog/DEPLOY.md`: document PR previews, automatic `main` production, and the local manual command.

## Task 1: Define The Deployment Manifest And Selection Contract

**Files:**
- Create: `tools/cloudflare/project.json`
- Create: `tools/cloudflare/deployment.test.mjs`
- Create: `tools/cloudflare/deployment.mjs`

- [ ] **Step 1: Register the Nx test project**

Create `tools/cloudflare/project.json`:

```json
{
  "name": "cloudflare-deployment",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "tools/cloudflare",
  "projectType": "application",
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": {
        "command": "eslint tools/cloudflare"
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": {
        "command": "node --test tools/cloudflare/*.test.mjs"
      }
    }
  },
  "tags": []
}
```

- [ ] **Step 2: Write failing manifest and selection tests**

Create `tools/cloudflare/deployment.test.mjs` with top-level `test(...)` cases and arrange/act/assert spacing. Start with these contracts:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PAGES_TARGETS,
  selectPreviewTargets,
} from './deployment.mjs';

test('defines the four Pages targets in display order', () => {
  const projectNames = PAGES_TARGETS.map((target) => target.cloudflareProject);

  assert.deepEqual(projectNames, [
    'hashbrown-www',
    'hashbrown-finance',
    'hashbrown-fast-food',
    'hashbrown-smart-home',
  ]);
});

test('selects only affected Pages projects', () => {
  const affectedProjects = ['core', 'finance-angular'];
  const changedFiles = ['samples/finance/angular/src/app/app.ts'];

  const result = selectPreviewTargets({ affectedProjects, changedFiles });

  assert.deepEqual(
    result.map((target) => target.nxProject),
    ['finance-angular'],
  );
});

test('selects from an injected target manifest', () => {
  const targets = [PAGES_TARGETS[1]];
  const affectedProjects = ['finance-angular', 'www'];
  const changedFiles = ['samples/finance/angular/src/app/app.ts'];

  const result = selectPreviewTargets({
    affectedProjects,
    changedFiles,
    targets,
  });

  assert.deepEqual(result, targets);
});

test('selects multiple affected Pages projects in manifest order', () => {
  const affectedProjects = ['smart-home-angular', 'www'];
  const changedFiles = ['packages/core/src/models.ts'];

  const result = selectPreviewTargets({ affectedProjects, changedFiles });

  assert.deepEqual(
    result.map((target) => target.nxProject),
    ['www', 'smart-home-angular'],
  );
});

test('selects every Pages project for deployment infrastructure changes', () => {
  const affectedProjects = [];
  const changedFiles = ['.github/workflows/pr-main.yml'];

  const result = selectPreviewTargets({ affectedProjects, changedFiles });

  assert.deepEqual(result, PAGES_TARGETS);
});

test('selects no Pages projects for unrelated changes', () => {
  const affectedProjects = ['core'];
  const changedFiles = ['packages/core/src/models.ts'];

  const result = selectPreviewTargets({ affectedProjects, changedFiles });

  assert.deepEqual(result, []);
});
```

Also add one global-invalidator case for each exact root file (`nx.json`, `package.json`, `package-lock.json`) and one prefix case for `tools/cloudflare/**`.

Add failing validation tests for `validatePagesTargets(targets)`: reject an empty list, duplicate ids, duplicate Nx projects, and any target missing a non-empty `id`, `displayName`, `nxProject`, `cloudflareProject`, or `outputDirectory`. These tests enforce failure before any runner can invoke Wrangler.

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx nx test cloudflare-deployment`

Expected: FAIL because `tools/cloudflare/deployment.mjs` does not exist.

- [ ] **Step 4: Implement the immutable manifest and selector**

Create `tools/cloudflare/deployment.mjs` with:

```js
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

const DEPLOYMENT_INFRASTRUCTURE_FILES = new Set([
  '.github/workflows/pr-main.yml',
  'nx.json',
  'package.json',
  'package-lock.json',
]);

/** Selects deployable Pages targets affected by a pull request. */
export function selectPreviewTargets({
  affectedProjects,
  changedFiles,
  targets = PAGES_TARGETS,
}) {
  const deployAll = changedFiles.some(
    (path) =>
      DEPLOYMENT_INFRASTRUCTURE_FILES.has(path) ||
      path.startsWith('tools/cloudflare/'),
  );

  if (deployAll) {
    return targets;
  }

  const affected = new Set(affectedProjects);
  return targets.filter((target) => affected.has(target.nxProject));
}
```

Add `validatePagesTargets(targets)` as a public pure function, validate `PAGES_TARGETS` at module initialization, and keep inputs immutable. Return selected targets in manifest order. Add TSDoc blocks to every exported constant and function, including `PAGES_TARGETS` and `validatePagesTargets`.

- [ ] **Step 5: Run test and lint targets**

Run: `npx nx test cloudflare-deployment`

Expected: PASS for all manifest and selection tests.

Run: `npx nx lint cloudflare-deployment`

Expected: PASS with no lint errors. The explicit target ensures the repository's existing `nx affected -t lint` command includes this project.

- [ ] **Step 6: Commit the selection contract**

```bash
git add tools/cloudflare/project.json tools/cloudflare/deployment.mjs tools/cloudflare/deployment.test.mjs
git commit -m "test: define Cloudflare deployment selection"
```

## Task 2: Add Stable Preview URLs And Comment Rendering

**Files:**
- Modify: `tools/cloudflare/deployment.test.mjs`
- Modify: `tools/cloudflare/deployment.mjs`

- [ ] **Step 1: Write failing branch, URL, ordering, and comment tests**

Add tests for:

- `previewBranch(42)` returning `pr-42` and rejecting non-positive/non-integer values.
- `previewUrl(PAGES_TARGETS[0], 42)` returning `https://pr-42.hashbrown-www.pages.dev`.
- results rendering in manifest order even when input results arrive out of order.
- successful rows containing linked preview URLs.
- `build-failed` and `deploy-failed` rows containing status text without a URL.
- the exact hidden marker `<!-- hashbrown-cloudflare-preview -->` appearing once.

Use this representative assertion:

```js
test('renders preview results in deterministic manifest order', () => {
  const results = [
    { targetId: 'finance', status: 'deploy-failed' },
    { targetId: 'docs', status: 'success' },
  ];

  const result = renderPreviewComment({ headSha: 'abcdef123456', results, prNumber: 42 });

  assert.match(result, /<!-- hashbrown-cloudflare-preview -->/);
  assert.ok(result.indexOf('| Docs |') < result.indexOf('| Finance |'));
  assert.match(result, /https:\/\/pr-42\.hashbrown-www\.pages\.dev/);
  assert.match(result, /Deployment failed/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx nx test cloudflare-deployment`

Expected: FAIL because the preview helpers are not exported.

- [ ] **Step 3: Implement preview helpers and comment rendering**

Add these public module contracts with TSDoc blocks:

```js
export const PREVIEW_COMMENT_MARKER = '<!-- hashbrown-cloudflare-preview -->';

/** Returns the stable Cloudflare branch name for a pull request. */
export function previewBranch(prNumber) { /* validate and return `pr-${prNumber}` */ }

/** Returns the stable Cloudflare Pages alias for a target and pull request. */
export function previewUrl(target, prNumber) { /* compose the pages.dev URL */ }

/** Renders the single marker-based pull request preview comment. */
export function renderPreviewComment({ headSha, prNumber, results }) {
  /* resolve target ids through PAGES_TARGETS, sort in manifest order, and render Markdown */
}
```

Use a compact table with columns `Site`, `Status`, and `Preview`. Render the short 7-character SHA above the table. Throw on unknown target ids or result statuses so malformed deployment output cannot silently produce a misleading comment.

- [ ] **Step 4: Run tests and lint**

Run: `npx nx test cloudflare-deployment`

Expected: PASS, including deterministic ordering and failed-result rendering.

Run: `npx nx lint cloudflare-deployment`

Expected: PASS.

- [ ] **Step 5: Commit the preview presentation contract**

```bash
git add tools/cloudflare/deployment.mjs tools/cloudflare/deployment.test.mjs
git commit -m "feat: format Cloudflare preview results"
```

## Task 3: Implement Preview Orchestration Test-First

**Files:**
- Create: `tools/cloudflare/deploy.test.mjs`
- Create: `tools/cloudflare/deploy.mjs`

- [ ] **Step 1: Write failing orchestration tests with injected dependencies**

Create `tools/cloudflare/deploy.test.mjs`. Define a fresh fake dependency object inside each test; do not use hooks or shared mutable state.

Test these behaviors through an exported `runPreviewDeployment(options, dependencies)` function:

1. No affected target performs no builds/deployments, checks the current PR head a second time immediately before comment deletion, and deletes an existing marker comment only while the run still matches the current head.
2. A successful run builds and deploys selected targets in manifest order, passes `branch: pr-<number>` and the head SHA to every deployment, then upserts one comment.
3. A build failure skips deployment for that target, continues other targets, reports all results, then rejects.
4. A Wrangler failure continues other targets, reports all results, then rejects.
5. A head SHA that is stale at startup performs no build, deploy, create, update, or delete operation and returns a superseded result.
6. A no-target run whose head becomes stale between selection and deletion leaves the existing comment untouched and returns a superseded result.
7. A head SHA that becomes stale before comment publication leaves the existing comment untouched and returns a superseded result.
8. A marker-comment create, update, or delete rejection propagates so the preview job and `PR Gate` fail.

Representative dependency shape:

```js
const dependencies = {
  listAffectedProjects: async () => ['www'],
  listChangedFiles: async () => ['www/analog/src/main.ts'],
  buildTarget: async () => ({ ok: true }),
  deployTarget: async () => ({ ok: true }),
  getPullRequestHead: async () => 'abcdef123456',
  findPreviewComment: async () => null,
  createPreviewComment: async () => {},
  updatePreviewComment: async () => {},
  deletePreviewComment: async () => {},
  appendSummary: async () => {},
};
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx nx test cloudflare-deployment`

Expected: FAIL because `tools/cloudflare/deploy.mjs` does not exist.

- [ ] **Step 3: Implement the minimal preview orchestrator**

Create `tools/cloudflare/deploy.mjs` and export:

```js
/** Builds, deploys, and reports affected pull request previews. */
export async function runPreviewDeployment(
  { baseSha, headSha, prNumber, targets = PAGES_TARGETS },
  dependencies,
) {
  // 1. Validate the target manifest before any subprocess call.
  // 2. Read the current PR head and return superseded if it differs.
  // 3. Resolve affected projects and changed files.
  // 4. Select targets through selectPreviewTargets, passing the validated targets.
  // 5. If selection is empty, re-read the PR head, then delete a marker comment only if current.
  // 6. Build/deploy each selected target with previewBranch(prNumber) and headSha.
  // 7. Re-read the PR head. If stale, do not write a comment.
  // 8. Render and create/update the marker comment.
  // 9. Append a summary and throw only after reporting when any target failed.
}
```

Return immutable result objects and avoid mutating the selected target array. Use explicit statuses `success`, `build-failed`, and `deploy-failed`. Assert in tests that `deployTarget` receives `{ target, branch: 'pr-42', sha: headSha }`.

Define the dependency failure contract now: `buildTarget` and `deployTarget` always resolve to `{ ok: true }` or `{ ok: false, error }` for expected subprocess outcomes. They do not reject on a nonzero process exit. GitHub API methods and unexpected programming errors may reject and must fail the job.

- [ ] **Step 4: Run tests and make the preview path pass**

Run: `npx nx test cloudflare-deployment`

Expected: PASS for the preview orchestration cases.

Run: `npx nx lint cloudflare-deployment`

Expected: PASS.

- [ ] **Step 5: Commit preview orchestration**

```bash
git add tools/cloudflare/deploy.mjs tools/cloudflare/deploy.test.mjs
git commit -m "feat: orchestrate affected Cloudflare previews"
```

## Task 4: Implement Production Orchestration And Runtime Adapters

**Files:**
- Modify: `tools/cloudflare/deploy.test.mjs`
- Modify: `tools/cloudflare/deploy.mjs`

- [ ] **Step 1: Write failing production orchestration tests**

Add tests for exported `runProductionDeployment({ sha }, dependencies)`:

1. Every Pages target builds before any Wrangler deployment starts.
2. Any build failure prevents all production deployments and rejects after writing the summary.
3. A deployment failure does not stop attempts for later targets and rejects after writing every result.
4. A fully successful run deploys all four targets with branch `main` and the supplied SHA.
5. An empty or malformed injected target list rejects before any build or Wrangler call.

- [ ] **Step 2: Write failing CLI and adapter-contract tests**

Add tests for:

- `parseDeployArgs(['preview', '--base', 'a', '--head', 'b', '--pr', '42'])`.
- `parseDeployArgs(['production', '--sha', 'abc'])`.
- rejection of unknown, missing, or malformed arguments.
- `wranglerDeployArgs(target, { branch: 'main', sha: 'abc' })` including project name, branch, commit hash, and `--commit-dirty=true`.
- `nxAffectedArgs({ baseSha: 'a', headSha: 'b' })` using `show projects --affected --base=a --head=b --withTarget=build --type=app --json`.
- a subprocess adapter mapping exit code `0` to `{ ok: true }` and nonzero exits or spawn errors to `{ ok: false, error }` without rejecting.

Add fetch-driven tests for an exported `createGitHubClient({ fetchImpl, token, repository })`:

- pull request lookup returns `head.sha` from `GET /pulls/{number}` and rejects malformed responses;
- comment listing follows pagination until fewer than 100 comments are returned;
- marker text authored by anyone except `github-actions[bot]` is ignored;
- the bot marker comment is returned even when it appears on a later page;
- create sends `POST /issues/{number}/comments`;
- update sends `PATCH /issues/comments/{commentId}`;
- delete sends `DELETE /issues/comments/{commentId}`; and
- every non-success response rejects with the method, path, and HTTP status.

- [ ] **Step 3: Run tests and verify they fail**

Run: `npx nx test cloudflare-deployment`

Expected: FAIL because production orchestration and adapter helpers are not implemented.

- [ ] **Step 4: Implement production orchestration**

Export `runProductionDeployment({ sha, targets = PAGES_TARGETS }, dependencies)`. Validate the manifest first. Build all targets before deployment. If any build returns `{ ok: false, error }`, append a summary and throw without calling Wrangler. Otherwise attempt every deployment, append the ordered summary, and throw after all attempts if any deployment returns `{ ok: false, error }`.

- [ ] **Step 5: Implement concrete runtime adapters and CLI entry point**

Implement and test the runtime in this order, rerunning `npx nx test cloudflare-deployment` after each bullet:

- execute child processes with argument arrays via `spawn`, never interpolated shell commands, and normalize exit/spawn failures to the dependency result contract;
- run `npx nx show projects` for affected projects;
- run `git diff --name-only <base>...<head>` for changed paths;
- run `npx nx build <project> --configuration=production`;
- run `npx wrangler pages deploy <directory> --project-name=<name> --branch=<branch> --commit-hash=<sha> --commit-dirty=true`;
- implement the tested GitHub client with `GITHUB_TOKEN` and `GITHUB_REPOSITORY`;
- read the current PR head through `GET /repos/{owner}/{repo}/pulls/{number}`;
- create, patch, or delete the marker comment through the tested client;
- append a Markdown result table to `GITHUB_STEP_SUMMARY`; and
- set a nonzero process exit code after result reporting when orchestration rejects.

Use this CLI surface:

```bash
node tools/cloudflare/deploy.mjs preview --base <sha> --head <sha> --pr <number>
node tools/cloudflare/deploy.mjs production --sha <sha>
```

Guard CLI execution by comparing `process.argv[1]` with the resolved module path, matching existing scripts in `scripts/*.mjs`.

- [ ] **Step 6: Run all tooling tests and lint**

Run: `npx nx test cloudflare-deployment`

Expected: PASS with no real subprocess, GitHub, or Cloudflare calls in tests.

Run: `npx nx lint cloudflare-deployment`

Expected: PASS.

- [ ] **Step 7: Commit the completed runner**

```bash
git add tools/cloudflare/deploy.mjs tools/cloudflare/deploy.test.mjs
git commit -m "feat: add Cloudflare deployment runner"
```

## Task 5: Consolidate GitHub Actions Deployment

**Files:**
- Modify: `.github/workflows/pr-main.yml`
- Modify: `.github/workflows/npm-publish.yml`
- Delete: `.github/workflows/cloudflare-preview.yml`
- Delete: `.github/workflows/cloudflare-production.yml`
- Delete: `scripts/deploy-smoke.mjs`
- Delete: `scripts/deploy-smoke.spec.mjs`

- [ ] **Step 1: Add workflow-level concurrency**

Add this near the top of `.github/workflows/pr-main.yml`:

```yaml
concurrency:
  group: pr-main-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

This keeps manual runs separate by event name, cancels superseded PR runs, and allows the active `main` workflow plus the newest pending push.

- [ ] **Step 2: Make deployment-tool tests part of common validation**

After `npm ci`, add:

```yaml
- name: Test Cloudflare deployment tooling
  run: npx nx test cloudflare-deployment
```

Keep the existing affected lint/test/build/e2e command unchanged after this step.

- [ ] **Step 3: Add the same-repository PR preview job**

Add `cloudflare-preview` with:

```yaml
cloudflare-preview:
  name: Cloudflare Preview
  if: >-
    github.event_name == 'pull_request' &&
    github.event.pull_request.head.repo.full_name == github.repository
  needs: ci
  runs-on: ubuntu-latest
  permissions:
    contents: read
    pull-requests: write
  steps:
    - name: Checkout pull request head
      uses: actions/checkout@v4
      with:
        ref: ${{ github.event.pull_request.head.sha }}
        fetch-depth: 0
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version-file: '.nvmrc'
        cache: npm
    - name: Install dependencies
      run: npm ci
    - name: Deploy affected previews
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        GITHUB_TOKEN: ${{ github.token }}
      run: >-
        node tools/cloudflare/deploy.mjs preview
        --base "${{ github.event.pull_request.base.sha }}"
        --head "${{ github.event.pull_request.head.sha }}"
        --pr "${{ github.event.pull_request.number }}"
```

Keep secrets scoped to this step. Do not use `pull_request_target`.

- [ ] **Step 4: Add production deployment from validated `main`**

Add `cloudflare-production` with the same checkout/setup/install pattern and:

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
needs: ci
permissions:
  contents: read
```

Run:

```yaml
- name: Deploy production
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  run: node tools/cloudflare/deploy.mjs production --sha "${{ github.sha }}"
```

Do not add an HTTP smoke test or a job-level concurrency group.

- [ ] **Step 5: Add the stable PR merge gate**

Add a job with explicit dependency-result handling so failures do not cause GitHub to skip the gate:

```yaml
pr-gate:
  name: PR Gate
  if: ${{ always() && github.event_name == 'pull_request' }}
  needs: [ci, cloudflare-preview]
  runs-on: ubuntu-latest
  steps:
    - name: Verify required jobs
      env:
        CI_RESULT: ${{ needs.ci.result }}
        PREVIEW_RESULT: ${{ needs.cloudflare-preview.result }}
      run: |
        if [[ "$CI_RESULT" != "success" ]]; then
          echo "Validation result: $CI_RESULT"
          exit 1
        fi

        if [[ "$PREVIEW_RESULT" != "success" && "$PREVIEW_RESULT" != "skipped" ]]; then
          echo "Preview result: $PREVIEW_RESULT"
          exit 1
        fi
```

The skipped preview case covers unaffected and fork pull requests. A same-repository no-op preview still runs successfully so it can remove a stale marker comment.

- [ ] **Step 6: Remove obsolete workflow and smoke-test surfaces**

Delete both standalone Cloudflare workflows and both deploy-smoke files. Remove the entire `deploy-cloudflare-production` job from `.github/workflows/npm-publish.yml` without changing npm OIDC permissions or package publication steps.

- [ ] **Step 7: Format and inspect workflow changes**

Run:

```bash
npx prettier --check .github/workflows/pr-main.yml .github/workflows/npm-publish.yml
actionlint .github/workflows/pr-main.yml .github/workflows/npm-publish.yml
rg -n "cloudflare-production|deploy-smoke|workflow_call" .github/workflows scripts
```

Expected: Prettier and actionlint pass. The search finds only the intentional production job id/name in `pr-main.yml`; it finds no promotion branch trigger, reusable Cloudflare call, or smoke script reference.

- [ ] **Step 8: Run deployment tooling tests again**

Run: `npx nx test cloudflare-deployment`

Expected: PASS.

- [ ] **Step 9: Commit workflow consolidation**

```bash
git add .github/workflows/pr-main.yml .github/workflows/npm-publish.yml tools/cloudflare scripts/deploy-smoke.mjs scripts/deploy-smoke.spec.mjs
git add -u .github/workflows
git commit -m "ci: deploy Cloudflare from PR and main workflow"
```

## Task 6: Document And Verify The Complete Change

**Files:**
- Modify: `www/analog/DEPLOY.md`

- [ ] **Step 1: Update deployment documentation**

Replace dashboard-driven deployment guidance with the repository workflow:

- same-repository PRs deploy affected Pages previews after validation;
- preview URLs are updated in one PR comment;
- fork PRs do not receive credentials or previews;
- validated pushes to `main` automatically deploy all four Pages projects;
- package publishing does not trigger Cloudflare;
- `npx nx deploy www` remains the manual local command; and
- the production branch in Cloudflare Pages is `main`.

- [ ] **Step 2: Run focused tooling verification**

Run:

```bash
npx nx test cloudflare-deployment
npx nx lint cloudflare-deployment
```

Expected: both targets pass.

- [ ] **Step 3: Run affected website checks required by repository policy**

Run:

```bash
npx nx build www
npx nx test www
npx nx lint www
```

Expected: all three targets pass. Record warnings separately rather than treating them as failures.

- [ ] **Step 4: Build every production deployment target**

Run:

```bash
npx nx run-many -t build --configuration=production -p finance-angular fast-food-angular smart-home-angular www
```

Expected: all four production builds pass. Confirm `fast-food-cloudflare` is absent because its output is not deployed by Pages.

- [ ] **Step 5: Run available sample checks**

Run:

```bash
npx nx test fast-food-angular
npx nx lint smart-home-angular
```

Expected: both configured targets pass. Do not invent test or lint targets for projects that do not define them.

- [ ] **Step 6: Verify selection and repository consistency**

Run:

```bash
npx nx show projects --affected --files=www/analog/DEPLOY.md --withTarget=build --type=app --json
npx prettier --check tools/cloudflare/*.mjs tools/cloudflare/project.json www/analog/DEPLOY.md .github/workflows/*.yml
actionlint .github/workflows/*.yml
git diff --check
git diff --check origin/main...HEAD
git status --short
```

Expected: the explicit-file affected output includes `www`; formatting and whitespace checks pass; status contains only intended changes. Use `--files` here because `www/analog/DEPLOY.md` is intentionally still uncommitted at this step.

- [ ] **Step 7: Commit documentation**

```bash
git add www/analog/DEPLOY.md
git commit -m "docs: explain automatic Cloudflare deployment"
```

- [ ] **Step 8: Request code review before publishing**

Use `superpowers:requesting-code-review` against `origin/main...HEAD`. Address blocking findings with `superpowers:receiving-code-review`, rerun the focused checks after any edits, and commit fixes separately.

## Task 7: Publish, Cut Over, And Merge On Green

**Files:**
- No additional repository files unless review or CI requires a fix.

- [ ] **Step 1: Push and open the implementation pull request**

Push the branch and open a ready-for-review PR summarizing:

- PR previews use Nx affected selection and a sticky comment;
- production deploys all four sites from validated `main`;
- npm publishing is independent; and
- the promotion branch and production smoke test are removed.

- [ ] **Step 2: Verify PR workflow behavior**

Wait for the PR workflow. Because `.github/workflows/pr-main.yml` and `tools/cloudflare/**` are global invalidators, expect all four previews in one marker comment on this implementation PR. Confirm:

- `Lint, Test, Build` succeeds;
- `Cloudflare Preview` succeeds;
- one comment lists Docs, Finance, Fast Food, and Smart Home in manifest order;
- every URL uses the `pr-<number>.<project>.pages.dev` alias; and
- `PR Gate` succeeds only after its dependencies settle.

Fix failures on the branch and repeat verification. Do not merge while any required result is pending or failed.

- [ ] **Step 3: Coordinate the Cloudflare production-branch switch**

Once the PR is green, pause npm release/tag movement. In each Pages project, change the production branch from `cloudflare-production` to `main` and verify the saved value:

- `hashbrown-www`
- `hashbrown-finance`
- `hashbrown-fast-food`
- `hashbrown-smart-home`

Keep this window short; the old npm-triggered job stops updating production after the first setting changes.

- [ ] **Step 4: Merge the green PR immediately after cutover**

Merge using the repository's normal strategy. Do not create or update a promotion commit on `cloudflare-production`.

- [ ] **Step 5: Verify the automatic production workflow**

Wait for the merged commit's `PR / Main CI` run. Confirm validation and `Cloudflare Production` succeed and that the Actions summary reports successful Cloudflare responses for all four projects. Do not add or run an HTTP production smoke test.

- [ ] **Step 6: Replace individual required checks with the stable PR gate**

Inspect the current branch protection/ruleset before editing it. Preserve review requirements, dismissal rules, force-push/deletion restrictions, and every non-status-check setting. Replace the status-check list used by this workflow with only `PR / Main CI / PR Gate`: remove the old individual `Lint, Test, Build` requirement and any obsolete standalone Cloudflare preview/production requirements. Preserve required checks owned by unrelated workflows. Open or refresh a harmless pull request only if GitHub requires `PR Gate` to appear before it can be selected.

Read the protection/ruleset again after the update and verify the effective required checks contain `PR / Main CI / PR Gate`, contain no removed Cloudflare workflow checks, and no longer require the individual PR/Main CI implementation jobs.

- [ ] **Step 7: Retire the promotion branch**

Resolve the exact remote branch first:

```bash
git ls-remote --heads origin refs/heads/cloudflare-production
```

After confirming the successful `main` production run, delete only that remote branch:

```bash
git push origin --delete cloudflare-production
```

Verify it is gone:

```bash
git ls-remote --heads origin refs/heads/cloudflare-production
```

Expected: no output from the final command. Do not delete local or unrelated branches.

- [ ] **Step 8: Final release-path check**

Confirm `.github/workflows/npm-publish.yml` still has `contents: write` and `id-token: write`, publishes from npm tags, creates no Cloudflare job, and preserves trusted publishing. The next package release should require no website-deployment action.
