# Cloudflare Deployment Redesign

## Summary

Hashbrown will deploy Cloudflare Pages from the same GitHub Actions workflow that validates pull requests and pushes to `main`. Pull requests receive previews only for affected Pages applications, and pushes to `main` automatically publish every Pages application to production.

This removes the `cloudflare-production` promotion branch and separates website deployment from npm publishing. The design follows the downstream deployment-job pattern used by Threadplane while retaining Nx-aware selection for Hashbrown's monorepo.

## Goals

- Make `main` the source of truth for Cloudflare production.
- Deploy production automatically after `main` validation succeeds.
- Deploy pull request previews only for affected Pages applications.
- Post preview URLs in one updated pull request comment.
- Make preview failures part of the required merge gate.
- Keep package publishing and website deployment independent.
- Avoid a production smoke test after Cloudflare accepts each deployment.

## Non-Goals

- Selectively deploy production applications. Production publishes all Pages applications for now.
- Deploy previews for pull requests from forks.
- Add a manual promotion or approval branch.
- Provide atomic deployment across multiple Cloudflare Pages projects. Cloudflare does not provide a cross-project transaction.
- Delete the latest preview deployment when a pull request closes. Cloudflare does not allow deletion of the latest deployment for a preview branch.

## Deployment Targets

A version-controlled manifest is the single source of truth for Pages metadata.

| Display name | Nx project | Cloudflare project | Output directory |
| --- | --- | --- | --- |
| Docs | `www` | `hashbrown-www` | `dist/www/analog/analog/public` |
| Finance | `finance-angular` | `hashbrown-finance` | `dist/samples/finance/angular/browser` |
| Fast Food | `fast-food-angular` | `hashbrown-fast-food` | `dist/samples/fast-food/angular/browser` |
| Smart Home | `smart-home-angular` | `hashbrown-smart-home` | `dist/samples/smart-home/angular/browser` |

The manifest will live in a small dependency-free deployment module under `tools/cloudflare/`. The module will also expose pure functions for target selection and preview-comment rendering so that these behaviors can be tested without invoking Cloudflare.

`fast-food-cloudflare` is not a Pages deployment target, and its build output is not consumed by the existing Pages commands. It will be removed from the Pages build list. This change does not alter the project itself or its ordinary CI coverage.

## Workflow Architecture

`.github/workflows/pr-main.yml` remains the single workflow for pull requests, pushes to `main`, and manual validation runs. Its existing `Lint, Test, Build` job remains the common validation dependency.

Concurrency is defined for the whole workflow, before validation starts:

- Pull request runs use a group keyed by pull request number with `cancel-in-progress: true`. A new head commit cancels the older validation and preview run.
- Pushes to `main` use one group with `cancel-in-progress: false`. The active workflow finishes and GitHub retains the newest pending workflow, intentionally coalescing intermediate pushes.
- Manual validation runs use a separate group and cannot delay pull request or `main` workflows.

Workflow-level concurrency prevents an older commit that validates slowly from entering deployment after a newer run. Deployment jobs do not define a second concurrency layer.

The workflow adds three downstream jobs:

- `Cloudflare Preview` runs only for pull requests from branches in the Hashbrown repository and depends on validation.
- `Cloudflare Production` runs only for pushes to `main` and depends on validation.
- `PR Gate` runs for pull requests after validation and preview processing. It provides one stable required check.

Preview and production jobs are mutually exclusive through event conditions. A manual workflow dispatch validates the selected ref but does not deploy it.

The standalone `.github/workflows/cloudflare-preview.yml` and `.github/workflows/cloudflare-production.yml` workflows will be removed. `.github/workflows/npm-publish.yml` will stop calling the production deployment workflow.

## Pull Request Preview Flow

### Selection

For a same-repository pull request, the common validation job keeps GitHub's default synthetic merge-commit checkout so CI validates the proposed merge result. The downstream preview job performs its own checkout of `github.event.pull_request.head.sha` with full history. Preview selection, build output, Cloudflare commit metadata, and the pull request comment therefore all represent the exact head commit.

The preview job compares `github.event.pull_request.base.sha` with `github.event.pull_request.head.sha`. It asks Nx for affected buildable applications and intersects that result with the deployment manifest.

The equivalent Nx query is:

```bash
npx nx show projects \
  --affected \
  --base="$BASE_SHA" \
  --head="$HEAD_SHA" \
  --withTarget=build \
  --type=app \
  --json
```

Nx owns application and library dependency traversal. If Nx misses a real dependency, the project graph will be corrected with `implicitDependencies` or another Nx-native relationship instead of adding path-specific shell logic.

The following deployment-infrastructure changes select all four Pages targets because they affect behavior outside the normal project graph:

- `.github/workflows/pr-main.yml`
- `tools/cloudflare/**`
- `nx.json`
- `package.json`
- `package-lock.json`

### Build And Deployment

Each selected target is built with its production configuration and deployed with Wrangler using:

- its manifest project name and output directory;
- `--branch=pr-<pull-request-number>`;
- the pull request head SHA as the commit hash; and
- `--commit-dirty=true` for generated build output.

The branch name creates one stable preview alias per pull request and Pages project. A new relevant push replaces the alias target. The job attempts every selected target, records each build and deployment result, and fails after all attempts if any target failed.

The stable URL is derived from Cloudflare's branch-alias format as `https://pr-<pull-request-number>.<cloudflare-project>.pages.dev`. Because the branch name is already lowercase and contains only letters, digits, and hyphens, Cloudflare does not need to normalize it further.

Before writing the marker comment, the job confirms that the pull request head still matches the run's head SHA. A superseded run leaves the comment untouched; workflow-level cancellation ensures the newer run replaces any partially published aliases.

### Pull Request Comment

After all target attempts, the workflow uses the GitHub API and the workflow token to create or update one comment identified by a hidden marker. The comment contains:

- the pull request head commit;
- one row per selected Pages target;
- a stable preview URL for each successful target; and
- a failure status for a target whose build or deployment failed.

The comment step runs even when a target fails, and the preview job still returns failure. It does not hide the failed check.

Creating, updating, or deleting the marker comment is part of successful preview processing. A GitHub API failure fails the preview job and therefore blocks `PR Gate`, because the requested preview URLs would not be reliably visible on the pull request.

When no Pages target is affected, the job does not post a comment. If a marker comment exists because an earlier revision affected a target that has since been reverted, the job deletes that comment so the pull request remains uncommented.

Fork pull requests skip previews and comments. The workflow uses the `pull_request` event and never `pull_request_target`, preventing untrusted fork code from receiving Cloudflare credentials.

## Production Flow

After validation succeeds on a push to `main`, the production job builds all four manifest targets with their production configuration. Every build must succeed before the first deployment begins.

The job then attempts all four Pages deployments with:

- `--branch=main`;
- the pushed commit SHA as the commit hash; and
- `--commit-dirty=true` for generated build output.

Every result is written to the GitHub Actions job summary. If one Pages deployment fails, the job continues attempting the remaining projects and returns failure after all attempts. Rerunning the job redeploys all four projects from the same commit.

Workflow-level production concurrency allows an active validation and multi-site deployment to finish before the newest queued `main` workflow begins. GitHub may replace an older pending workflow when a newer push arrives; this is intentional. Intermediate commits do not all need to validate or deploy, but the active workflow completes and the newest queued `main` commit is eventually validated and published if validation succeeds.

There is no post-deployment production smoke test. Successful local builds and successful Cloudflare deployment responses define completion.

## Merge Gate

`PR Gate` is the stable required check for branch protection. It succeeds only when:

- the common validation job succeeds; and
- an affected same-repository preview succeeds, or preview deployment is legitimately skipped because the pull request is unaffected or comes from a fork.

It fails when validation or a required preview fails or is cancelled. Branch protection will require `PR Gate` rather than individual implementation jobs, allowing the workflow structure to evolve without weakening merge safety.

## Credentials And Permissions

The workflow defaults to `contents: read`.

- Preview deployment receives Cloudflare credentials only in the deployment job and adds `pull-requests: write` for its marker comment.
- Production deployment receives Cloudflare credentials only in the production job.
- The Cloudflare token should have the minimum Pages write permissions required for the four projects.
- npm publishing continues to use its configured OIDC trusted-publishing path. No Cloudflare deployment is triggered by npm publishing.

## Release Separation

Website content is published when it reaches `main`, independent of package versions. The npm release workflow remains responsible for package publication, explicit GitHub release creation, and release tag updates. It no longer owns or waits for Cloudflare production.

This means a release post merged to `main` becomes live through the normal website deployment even if package publication happens in a separate workflow run.

## Error Handling

- A validation failure prevents both preview and production deployment.
- A preview target failure is shown in the marker comment and blocks `PR Gate`.
- A preview-comment API failure blocks `PR Gate` because the preview result was not successfully reported.
- A production build failure prevents all production deployments.
- A production deployment failure does not prevent attempts for other Pages projects, but the production job fails.
- A malformed or empty deployment manifest fails before invoking Wrangler.
- Missing Cloudflare credentials fail only deployment jobs and do not expose secret values in comments or summaries.
- A superseded preview workflow is cancelled; an active `main` workflow is never cancelled by a newer push.

## Testing And Verification

`tools/cloudflare` will be an Nx project with an explicit test target. The common validation job always runs this lightweight target, including for unaffected and fork pull requests, in addition to its normal affected-project commands. The dependency-free deployment module will use top-level tests and the repository's arrange/act/assert style. Tests cover:

- selecting one affected Pages target;
- selecting multiple targets through shared dependencies;
- selecting all targets for deployment-infrastructure changes;
- selecting no targets;
- deterministic `pr-<number>` branch names;
- successful and partially failed preview comment rendering; and
- deletion behavior for a stale marker comment when no target remains affected.

Implementation verification will also include:

- parsing and formatting the changed workflow;
- running the deployment-module tests;
- exercising target selection against representative base and head SHAs;
- running required build, test, and lint targets for affected Nx projects;
- opening the implementation pull request with a docs change so the `www` preview and marker comment run end to end; and
- confirming that the first merged `main` run receives successful Cloudflare responses for all four Pages projects.

The final item verifies deployment orchestration only; it does not add HTTP production smoke tests.

## Migration Order

1. Open the implementation pull request, including an affected `www` change that safely exercises preview deployment and comment updates.
2. After the pull request is green and immediately before merging, pause releases and change the production branch for all four Cloudflare Pages projects from `cloudflare-production` to `main`.
3. Merge the implementation pull request as soon as the four project settings are updated, keeping the old npm-triggered production gap brief and preventing another release from entering it.
4. Confirm the resulting push-to-`main` production job succeeds for all four Pages projects.
5. Configure branch protection to require the new `PR Gate` check.
6. Retire the remote `cloudflare-production` branch after the first successful production deployment from `main`.

The project-setting change and merge are coordinated because the old npm workflow deploys with `--branch=cloudflare-production`, which stops updating production once Cloudflare is configured for `main`. The existing preview workflow does not conflict with the switch because it publishes branches named `preview-<sha>`, not `main`.

## Alternatives Considered

### Reusable Deployment Workflow

Keeping triggers in `PR / Main CI` while moving Cloudflare logic into a reusable workflow would reduce the size of the main YAML file. It was rejected because nested workflow output passing makes affected-target selection and pull request comment aggregation less transparent.

### Cloudflare Native Git Integration

Cloudflare could own pull request and production deployment triggers. It was rejected because it would duplicate Nx builds, weaken affected-project control, and separate deployment status from Hashbrown's required GitHub Actions graph.

### Promotion Branch

Continuing to use `cloudflare-production` would preserve manual promotion. It was rejected because it creates a second source of truth, permits branch divergence, and couples releases to unrelated website deployment mechanics.

## Acceptance Criteria

- A same-repository pull request affecting `www` deploys only the Docs preview and receives one updated preview comment.
- A same-repository pull request affecting a sample deploys only the affected Pages sample previews.
- A deployment-infrastructure change previews all four Pages projects.
- An unaffected or fork pull request has no preview comment and can pass `PR Gate` when validation succeeds.
- A failed affected preview blocks `PR Gate` and is visible in the marker comment.
- The newest validated `main` commit is eventually deployed to all four Pages projects; superseded pending commits may be coalesced.
- npm publication neither triggers nor waits for Cloudflare deployment.
- No workflow deploys from or promotes through `cloudflare-production`.
- No production HTTP smoke test runs after deployment.
