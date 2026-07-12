# Node 24 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move local development and every GitHub Actions workflow to Node 24.18.0, whose bundled npm 11.16.0 satisfies npm trusted publishing requirements.

**Architecture:** Keep `.nvmrc` as the repository's single Node version source. Every workflow will read that file through `actions/setup-node@v4`, and the redundant single-value nightly matrix will be removed.

**Tech Stack:** Node.js 24.18.0, npm 11.16.0, GitHub Actions, Nx, actionlint, Prettier

---

### Task 1: Centralize Node 24 Configuration

**Files:**
- Modify: `.nvmrc`
- Modify: `.github/workflows/npm-publish.yml`
- Modify: `.github/workflows/pr-main.yml`
- Modify: `.github/workflows/nightly.yml`

- [ ] **Step 1: Prove the old selectors exist**

Run:

```bash
rg -n "v22\.14\.0|node-version: 22\.x|setup-node@v3" .nvmrc .github/workflows
```

Expected: matches in `.nvmrc`, `npm-publish.yml`, `pr-main.yml`, and `nightly.yml`.

- [ ] **Step 2: Update the runtime source**

Set `.nvmrc` to:

```text
v24.18.0
```

In `npm-publish.yml` and `pr-main.yml`, replace `node-version: 22.x` with:

```yaml
node-version-file: '.nvmrc'
```

Upgrade `actions/setup-node@v3` to `actions/setup-node@v4` in `pr-main.yml` and `nightly.yml`.

In `nightly.yml`, remove the one-value Node strategy matrix, change the setup step name to `Setup Node.js`, and configure:

```yaml
node-version-file: '.nvmrc'
```

- [ ] **Step 3: Prove old selectors are gone**

Run:

```bash
if rg -n "v22\.14\.0|node-version: 22\.x|setup-node@v3" .nvmrc .github/workflows; then exit 1; fi
```

Expected: no matches and exit code 0.

- [ ] **Step 4: Validate workflow syntax and formatting**

Run:

```bash
actionlint .github/workflows/*.yml
test "$(cat .nvmrc)" = "v24.18.0"
npx prettier --check .github/workflows/npm-publish.yml .github/workflows/pr-main.yml .github/workflows/nightly.yml
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the migration**

```bash
git add .nvmrc .github/workflows/npm-publish.yml .github/workflows/pr-main.yml .github/workflows/nightly.yml
git commit -m "ci: migrate workflows to Node 24"
```

### Task 2: Verify Dependency Compatibility

**Files:**
- Modify if necessary: `package-lock.json`

- [ ] **Step 1: Activate the repository runtime**

Run:

```bash
source "$HOME/.nvm/nvm.sh"
nvm install
nvm use
node --version
npm --version
```

Expected: Node `v24.18.0` and npm `11.16.0`.

- [ ] **Step 2: Install from the existing lockfile**

Run:

```bash
npm ci
git status --short package-lock.json
```

Expected: installation succeeds. Retain `package-lock.json` only if npm produces a necessary deterministic compatibility change.

- [ ] **Step 3: Run every Nx verification target**

Run:

```bash
npx nx run-many -t lint,test,build,e2e --all --parallel=3
```

Expected: all available lint, test, build, and e2e targets pass under Node 24.

- [ ] **Step 4: Commit a lockfile update only if required**

If `package-lock.json` changed because Node 24's npm requires an update:

```bash
git add package-lock.json
git commit -m "chore: refresh lockfile for Node 24"
```

If it did not change, do not create a commit.

### Task 3: Final Verification

**Files:**
- Verify: `.nvmrc`
- Verify: `.github/workflows/*.yml`
- Review: complete committed patch

- [ ] **Step 1: Re-run static validation**

Run:

```bash
actionlint .github/workflows/*.yml
cmp -s .nvmrc <(printf 'v24.18.0\n')
npx prettier --check .github/workflows/npm-publish.yml .github/workflows/pr-main.yml .github/workflows/nightly.yml
git diff --check origin/main...HEAD
if rg -n "v22\\.14\\.0|node-version: 22\\.x|setup-node@v3" .nvmrc .github/workflows; then exit 1; fi
```

Expected: all commands exit 0.

- [ ] **Step 2: Review the final branch**

Run:

```bash
git status --short
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
```

Expected: no uncommitted files; the history and complete committed patch contain only the approved design, plan, Node migration, and any required compatibility fix.
