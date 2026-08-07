# GitHub Actions and Dependency Security Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove GitHub Actions runtime deprecation warnings and reduce npm audit findings with compatible dependency updates.

**Architecture:** Preserve the unified deployment and independent npm publishing workflows while moving GitHub-owned actions to their Node 24-based v7 releases. Refresh only dependencies already allowed by `package.json`, then record residual findings by the migration required to fix them.

**Tech Stack:** GitHub Actions YAML, Node.js 24, npm lockfiles and audit, Nx, Node test runner

---

## File Map

- Modify `.github/workflows/pr-main.yml`: use current checkout and Node setup action majors.
- Modify `.github/workflows/npm-publish.yml`: use the same action majors without changing trusted publishing.
- Modify `.github/workflows/nightly.yml`: use the same action majors.
- Modify `tools/cloudflare/workflow.test.mjs`: prevent workflow action versions from regressing.
- Modify `package.json`: raise vulnerable dependency minimums within compatible release lines.
- Modify `package-lock.json`: regenerate the dependency graph with Node 24 and npm 11.
- Create `docs/security/dependency-audit-2026-08-07.md`: record audit improvement and remaining migration groups.

### Task 1: Protect the workflow runtime versions

**Files:**
- Modify: `tools/cloudflare/workflow.test.mjs`

- [ ] **Step 1: Write the failing regression test**

Add all three workflow paths and this top-level test:

```js
test('uses Node 24-based GitHub actions in every workflow', async () => {
  const workflows = await Promise.all(
    workflowPaths.map(async (workflowPath) => ({
      workflowPath,
      contents: await readFile(workflowPath, 'utf8'),
    })),
  );

  for (const { workflowPath, contents } of workflows) {
    const actionReferences = [
      ...contents.matchAll(/actions\/(checkout|setup-node)@(\S+)/g),
    ];

    assert.ok(actionReferences.length > 0);

    for (const [, action, version] of actionReferences) {
      assert.equal(
        version,
        'v7',
        `${workflowPath.pathname} uses actions/${action}@${version}`,
      );
    }
  }
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tools/cloudflare/workflow.test.mjs`

Expected: FAIL because the workflows still reference v4.

- [ ] **Step 3: Commit the failing test**

```bash
git add tools/cloudflare/workflow.test.mjs
git commit -m "test: require Node 24 GitHub actions"
```

### Task 2: Upgrade GitHub-owned actions

**Files:**
- Modify: `.github/workflows/pr-main.yml`
- Modify: `.github/workflows/npm-publish.yml`
- Modify: `.github/workflows/nightly.yml`

- [ ] **Step 1: Apply the minimal workflow changes**

Replace every `actions/checkout@v4` and `actions/setup-node@v4` reference with
`@v7`. Do not change triggers, permissions, inputs, jobs, or deployment commands.

- [ ] **Step 2: Run the focused test and verify it passes**

Run: `node --test tools/cloudflare/workflow.test.mjs`

Expected: PASS.

- [ ] **Step 3: Validate workflow formatting and syntax**

Run: `npx prettier --check .github/workflows/pr-main.yml .github/workflows/npm-publish.yml .github/workflows/nightly.yml tools/cloudflare/workflow.test.mjs`

Run when installed: `actionlint .github/workflows/pr-main.yml .github/workflows/npm-publish.yml .github/workflows/nightly.yml`

Expected: PASS. If `actionlint` is unavailable, report that and rely on repository tests plus GitHub validation.

- [ ] **Step 4: Commit the workflow update**

```bash
git add .github/workflows/pr-main.yml .github/workflows/npm-publish.yml .github/workflows/nightly.yml
git commit -m "ci: update GitHub actions to Node 24 runtimes"
```

### Task 3: Refresh compatible vulnerable dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Capture the baseline**

Run: `npm audit --json`

Expected baseline: 99 total findings: 5 low, 36 moderate, 57 high, and 1 critical. Production-only baseline: 28 total findings: 2 low, 5 moderate, 21 high, and 0 critical.

- [ ] **Step 2: Confirm the lockfile toolchain**

Run: `node --version`

Expected: `v24.18.0`, matching `.nvmrc`.

Run: `npm --version`

Expected: npm 11.

- [ ] **Step 3: Raise compatible dependency minimums**

Update the manifest to these minimums without changing major release lines:

- Angular runtime packages and `@angular/compiler-cli`: `^20.3.27`
- `@modelcontextprotocol/sdk`: `^1.30.0`
- `mermaid`: `^10.9.8`
- `postcss`: `^8.5.26`
- `serverless-offline`: `^14.8.0`
- `verdaccio`: `^6.9.2`

- [ ] **Step 4: Regenerate the lockfile with the CI toolchain**

Back up the existing lockfile outside the worktree, remove the worktree copy,
then run:

`npm install --package-lock-only --ignore-scripts`

Expected: PASS and a new lockfile. This procedure is required because npm 11's
targeted `npm update --package-lock-only` leaves the locked dependency graph
unchanged in this repository.

Expected resolved targets include Angular 20.3.27, MCP SDK 1.30.x,
Mermaid 10.9.8, PostCSS 8.5.26, Serverless Offline 14.8.x, Verdaccio 6.9.2,
and Velocity.js 2.1.7 transitively.

- [ ] **Step 5: Review lockfile scope**

Run: `git diff --stat package-lock.json`

Run: `git diff -- package-lock.json`

Expected: dependency resolution changes only; no dependency crosses a declared
release line and no forced downgrade or override is introduced. A full npm 11
regeneration is expected to remove stale transitive entries.

- [ ] **Step 6: Reinstall exactly from the lockfile**

Run: `npm ci`

Expected: PASS.

- [ ] **Step 7: Validate peer dependencies**

Run: `npm ls --all`

Expected: PASS with no invalid or missing peer dependency.

- [ ] **Step 8: Re-run full and production audits**

Run: `npm audit --json`

Run: `npm audit --omit=dev --json`

Expected from the disposable Node 24/npm 11 regeneration: 59 full findings
(2 low, 27 moderate, 30 high, 0 critical) and 3 production findings (all high,
from the deferred Nx migration). The critical Velocity.js and patched Angular
findings must be removed. Do not force fixes for residual findings.

- [ ] **Step 9: Commit the compatible refresh**

```bash
git add package.json package-lock.json
git commit -m "chore: refresh compatible security fixes"
```

### Task 4: Document residual audit findings

**Files:**
- Create: `docs/security/dependency-audit-2026-08-07.md`

- [ ] **Step 1: Write the audit record**

Record:

- baseline and final full/production severity totals;
- compatible packages refreshed in this pull request;
- residual groups requiring separate work: Nx 23, React Router 7, Analog/sharp,
  Wrangler and Serverless downgrade advisories, and remaining build-only tooling;
- why `npm audit fix --force`, dependency overrides, and unsafe downgrades were not used.

- [ ] **Step 2: Verify the record against the current audit**

Run both audit commands again and compare every documented total.

- [ ] **Step 3: Commit the audit record**

```bash
git add docs/security/dependency-audit-2026-08-07.md
git commit -m "docs: triage residual dependency advisories"
```

### Task 5: Verify and publish the maintenance pull request

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run repository-specific deployment tests**

Run: `npx nx test cloudflare-deployment`

Expected: PASS.

- [ ] **Step 2: Run affected validation**

Run: `npx nx affected -t lint,test,build,e2e --base=origin/main --head=HEAD --parallel=3`

Expected: PASS for every affected target.

- [ ] **Step 3: Verify publishing remains independent**

Inspect `.github/workflows/npm-publish.yml` and confirm it still triggers only on
`npm/preview` and `npm/latest`, retains `id-token: write`, and has no Cloudflare
job or dependency.

- [ ] **Step 4: Run final hygiene checks**

Run: `git diff --check origin/main...HEAD`

Run: `git status --short --branch`

Expected: no whitespace errors and a clean branch.

- [ ] **Step 5: Push and open the pull request**

Push `blove/actions-security-maintenance` and open a ready pull request against
`main` with the audit before/after totals in its description.

- [ ] **Step 6: Merge only after required validation is green**

Confirm `PR / Main CI / PR Gate` succeeds, then squash-merge. Do not merge while
validation or previews are failing.

- [ ] **Step 7: Remove the obsolete worktree**

From `/Users/blove/repos/hashbrown`, verify
`/Users/blove/repos/hashbrown/.worktrees/cloudflare-deployment-implementation`
is clean, remove that worktree, and verify it no longer appears in
`git worktree list`.
