# Vercel Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Cloudflare Pages deployment of the `www` docs site with a workflow-native Vercel pipeline (GitHub Deployments for visibility), a scripted one-time bootstrap, and no Cloudflare/Wrangler left in the repo.

**Architecture:** `nx build www` emits a Vercel Build Output API tree via Nitro's `vercel` preset. A reusable `deploy.yml` workflow runs a matrix of targets: build → create GitHub Deployment → `vercel deploy --prebuilt` → set deployment status. `pr-main.yml` selects affected targets for PR previews and deploys all targets to production on `main`. `tools/vercel/bootstrap.mjs` provisions the Vercel project, env vars, domains, GitHub secrets, and tears down Cloudflare through their REST APIs.

**Tech Stack:** Nitro 3 (`vercel` preset), Vercel CLI 59.x, GitHub Actions reusable workflows, GitHub Deployments API via `gh`, Node 24 `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-15-vercel-deployment-design.md`

**Working directory for every command:** `/Users/blove/repos/hashbrown/.claude/worktrees/homepage-v0-5-refresh-0d5f43` (branch `blove/hashbrown-vercel-migration-66856c`). Never `cd` to the main checkout. The token file `/Users/blove/repos/hashbrown/.env` is read by path in Task 11 only; never print its contents.

---

## File Map

| Path | Action | Responsibility |
| --- | --- | --- |
| `www/analog/vite.config.ts` | modify | Nitro preset `vercel`, `maxDuration` (output lands at `<repo-root>/.vercel/output` because Analog pins Nitro output to its `workspaceRoot`) |
| `www/analog/src/tools/clean-build-output.mjs` | modify | remove both client `dist` and `.vercel/output` |
| `www/analog/src/server/routes/_/chat.post.ts` | modify | `process.env` only; streaming-safe headers |
| `www/analog/e2e/deployment-artifact.e2e.test.mjs` | modify | assert the Vercel output tree instead of the Worker |
| `www/analog/project.json` | modify | `deploy` target uses Vercel CLI |
| `www/analog/wrangler.toml` | delete | |
| `www/analog/DEPLOY.md` | rewrite | Vercel deployment notes |
| `.gitignore` | modify | `.wrangler` → `.vercel` |
| `package.json`, `package-lock.json` | modify | drop `wrangler`, add `vercel` |
| `tools/cloudflare/**` | delete | old deployer |
| `samples/{finance,fast-food,smart-home}/cloudflare/**` | delete | Pages Functions builds |
| `samples/{finance,fast-food,smart-home}/angular/functions/**` | delete | Pages Functions source |
| `samples/{finance,fast-food,smart-home}/angular/wrangler.toml` | delete | |
| `samples/{finance,fast-food,smart-home}/angular/project.json` | modify | remove `deploy` target |
| `AGENTS.md`, `docs/release-runbook.md` | modify | remove Cloudflare target listings |
| `.github/workflows/deploy.yml` | create | reusable per-target deploy job |
| `.github/workflows/pr-main.yml` | modify | target selection, preview, production, gate |
| `tools/vercel/bootstrap.mjs` | create | idempotent provisioning |
| `tools/vercel/bootstrap.test.mjs` | create | unit tests for the pure/API-shaped pieces |
| `tools/vercel/project.json` | create | Nx `lint` + `test` targets |

---

### Task 0: Install dependencies in the worktree

**Files:** none

- [ ] **Step 1: Install**

Run: `npm ci`
Expected: completes without error; `ls node_modules/nitro/package.json` exists.

- [ ] **Step 2: Confirm Nitro version and vercel preset location**

Run: `node -e "console.log(require('./node_modules/nitro/package.json').version)" && ls node_modules/nitro/dist/presets/ | grep -i vercel`
Expected: `3.0.260522-beta` and a `vercel` entry (directory or file).

---

### Task 1: Switch the www build to the Vercel preset

**Files:**
- Modify: `www/analog/vite.config.ts:74-93`
- Modify: `www/analog/src/tools/clean-build-output.mjs`
- Modify: `.gitignore:57`

- [ ] **Step 1: Change the Nitro plugin options**

In `www/analog/vite.config.ts`, replace the `nitro({ ... })` call so it reads:

```ts
        : nitro({
            preset: 'vercel',
            vercel: {
              functions: {
                // Hobby default and ceiling; streamed response time counts.
                maxDuration: 300,
              },
            },
            renderer: {
              template: resolve(__dirname, 'index.html'),
            },
            alias: {
              '@hashbrownai/angular': resolve(
                __dirname,
                '../../packages/angular/src/index.ts',
              ),
              '@hashbrownai/core': resolve(
                __dirname,
                '../../packages/core/src/index.ts',
              ),
              '@hashbrownai/openai': resolve(
                __dirname,
                '../../packages/openai/src/index.ts',
              ),
            },
          })),
```

- [ ] **Step 2: Clean both output locations**

Replace the contents of `www/analog/src/tools/clean-build-output.mjs` with:

```js
import { rm } from 'node:fs/promises';

const outputDirectories = [
  new URL('../../../../dist/www/analog', import.meta.url),
  new URL('../../../../.vercel/output', import.meta.url),
];

await Promise.all(
  outputDirectories.map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ),
);
```

- [ ] **Step 3: Ignore the Vercel output and link directory**

In `.gitignore`, replace the line `.wrangler` (under `# Nitro`) with:

```
.vercel
```

- [ ] **Step 4: Build**

Run: `npx nx build www --configuration=production --skip-nx-cache`
Expected: exits 0. Ignore Angular budget warnings.

- [ ] **Step 5: Inspect the output tree**

Run: `ls .vercel/output && ls .vercel/output/functions && cat .vercel/output/functions/__server.func/.vc-config.json && node -e "const c=require('./.vercel/output/config.json');console.log('version',c.version,'routes',c.routes.length)"`

Note: Analog's Nitro module (`@analogjs/platform/src/lib/nitro/analog-nitro-plugin.js`) overrides Nitro's output directory for any `vercel*` preset to `<analog workspaceRoot>/.vercel/output`, which is the repository root here. Nitro's own `output.dir`/`rootDir` options have no effect. The repository root is therefore the Vercel project directory for every later task.

Expected:
- `config.json  functions  nitro.json  static`
- `__server.func` (plus a `_` directory for the `/_/**` API routes)
- `.vc-config.json` containing `"runtime": "nodejs24.x"`, `"handler": "index.mjs"`, `"launcherType": "Nodejs"`, `"supportsResponseStreaming": true`, `"maxDuration": 300`
- `version 3 routes <n>` with n > 0

- [ ] **Step 6: Confirm static assets and the SSR template landed**

Run: `ls .vercel/output/static | head && test -f .vercel/output/static/index.html && echo INDEX_OK`
Expected: hashed JS/CSS files, `favicon*`, and `INDEX_OK`.

- [ ] **Step 7: Commit**

```bash
git add www/analog/vite.config.ts www/analog/src/tools/clean-build-output.mjs .gitignore
git commit -m "build(www): emit Vercel Build Output API tree via Nitro vercel preset

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Make the chat route Vercel-native

**Files:**
- Modify: `www/analog/src/server/routes/_/chat.post.ts`

- [ ] **Step 1: Rewrite the env access and headers**

Replace the whole file with:

```ts
import 'dotenv/config';
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import {
  defineEventHandler,
  readBody,
  sendStream,
  setResponseHeader,
} from 'h3';

const getEnv = (key: string): string | undefined => {
  const value = process.env[key];

  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export default defineEventHandler(async (event) => {
  const input = await readBody<RunAgentInput>(event);

  const apiKey = getEnv('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const abortController = new AbortController();
  const abort = () => abortController.abort();
  if (event.req.signal.aborted) {
    abort();
  } else {
    event.req.signal.addEventListener('abort', abort, { once: true });
  }
  const cleanup = () => event.req.signal.removeEventListener('abort', abort);
  const stream = HashbrownOpenAI.stream.text({
    apiKey,
    baseURL: getEnv('OPENAI_BASE_URL'),
    model: getEnv('OPENAI_MODEL') ?? 'gpt-5-nano',
    input,
    signal: abortController.signal,
    transformRequestOptions: (options) => {
      return {
        ...options,
        reasoning_effort: 'low',
      };
    },
  });
  const eventEncoder = new EventEncoder();
  const textEncoder = new TextEncoder();
  const iterator = stream[Symbol.asyncIterator]();

  // Streaming on Vercel's Node runtime is chunk-by-chunk as long as nothing
  // between the function and the client is allowed to buffer or transform.
  setResponseHeader(event, 'Content-Type', eventEncoder.getContentType());
  setResponseHeader(
    event,
    'Cache-Control',
    'no-cache, no-store, must-revalidate, no-transform',
  );
  setResponseHeader(event, 'X-Accel-Buffering', 'no');

  const readableStream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          cleanup();
          controller.close();
          return;
        }

        controller.enqueue(
          textEncoder.encode(eventEncoder.encodeSSE(next.value)),
        );
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    async cancel() {
      abort();
      cleanup();
      await iterator.return?.();
    },
  });

  return sendStream(event, readableStream);
});
```

- [ ] **Step 2: Typecheck and unit-test www**

Run: `npx nx run-many -t typecheck,test,lint -p www`
Expected: all three pass.

- [ ] **Step 3: Commit**

```bash
git add www/analog/src/server/routes/_/chat.post.ts
git commit -m "feat(www): read chat secrets from process.env and harden SSE headers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Point the deployment-artifact e2e test at the Vercel output

**Files:**
- Modify: `www/analog/e2e/deployment-artifact.e2e.test.mjs`

- [ ] **Step 1: Change the deployment directory and skip bundled node_modules**

At the top of the file, replace

```js
const deploymentDirectory = new URL(
  '../../../dist/www/analog/',
  import.meta.url,
);
```

with

```js
const deploymentDirectory = new URL(
  '../../../.vercel/output/',
  import.meta.url,
);
const functionDirectory = new URL(
  'functions/__server.func/',
  deploymentDirectory,
);
const staticDirectory = new URL('static/', deploymentDirectory);
```

In `listJavaScriptFiles`, change the directory branch so traced dependencies are not scanned:

```js
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          return [];
        }

        return listJavaScriptFiles(new URL(`${entry.name}/`, directory));
      }
```

- [ ] **Step 2: Replace every test from the Cloudflare artifact test to the end of file**

Delete from the line `test('production build creates a deployable Cloudflare Pages artifact', async () => {` through the end of the file, and append:

```js
test('production build creates a Vercel Build Output API artifact', async () => {
  const config = JSON.parse(
    await readFile(new URL('config.json', deploymentDirectory), 'utf8'),
  );
  const functionConfig = JSON.parse(
    await readFile(new URL('.vc-config.json', functionDirectory), 'utf8'),
  );

  assert.equal(config.version, 3);
  assert.ok(Array.isArray(config.routes) && config.routes.length > 0);
  assert.match(functionConfig.runtime, /^nodejs\d+\.x$/);
  assert.equal(functionConfig.launcherType, 'Nodejs');
  assert.equal(functionConfig.supportsResponseStreaming, true);
  assert.equal(functionConfig.maxDuration, 300);
  await stat(new URL(functionConfig.handler, functionDirectory));
  await stat(new URL('index.html', staticDirectory));
});

test('production function does not bundle bare RxJS specifiers', async () => {
  const files = await listJavaScriptFiles(functionDirectory);
  const bareImports = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');

    for (const specifier of collectRxjsImports(source)) {
      bareImports.push(`${file.href.slice(functionDirectory.href.length)}: ${specifier}`);
    }
  }

  assert.deepEqual(bareImports, []);
});

test('production build excludes removed Writer provider artifacts', async () => {
  const files = [
    ...(await listJavaScriptFiles(functionDirectory)),
    ...(await listJavaScriptFiles(staticDirectory)),
  ];
  const writerFiles = files.filter((file) =>
    /(?:^|\/)writer-[^/]+\.js$/.test(file.pathname),
  );
  const writerReferences = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');

    if (
      /@hashbrownai\/writer|WriterKnownModelIds|Writer adapter/.test(source)
    ) {
      writerReferences.push(file.href.slice(deploymentDirectory.href.length));
    }
  }

  assert.deepEqual(writerFiles, []);
  assert.deepEqual(writerReferences, []);
});

test('production HTML references a built favicon', async () => {
  const html = await readFile(new URL('index.html', staticDirectory), 'utf8');

  const faviconPath = html.match(
    /<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["'](\/[^"']+)["'])[^>]*>/,
  )?.[1];
  const faviconExists = faviconPath
    ? await stat(new URL(faviconPath.slice(1), staticDirectory)).then(
        (favicon) => favicon.isFile(),
        () => false,
      )
    : false;

  assert.equal(faviconExists, true);
});

test('Nx deploys the prebuilt output with the Vercel CLI', async () => {
  const project = JSON.parse(
    await readFile(new URL('../project.json', import.meta.url), 'utf8'),
  );

  assert.equal(
    project.targets.deploy.options.command,
    'npx vercel deploy --prebuilt --yes',
  );
});
```

`collectRxjsImports`, `listJavaScriptFiles`, `readFile`, and `stat` are already defined/imported at the top of this file; do not add duplicate imports.

- [ ] **Step 3: Run the e2e suite**

Run: `npx nx e2e www --skip-nx-cache`
Expected: all tests pass (this rebuilds first because `e2e` depends on `build`).

- [ ] **Step 4: Commit**

```bash
git add www/analog/e2e/deployment-artifact.e2e.test.mjs
git commit -m "test(www): verify the Vercel deployment artifact

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Swap the CLI dependency and the local deploy target

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `www/analog/project.json` (`deploy` target)
- Delete: `www/analog/wrangler.toml`
- Rewrite: `www/analog/DEPLOY.md`

- [ ] **Step 1: Replace wrangler with vercel**

Run: `npm uninstall wrangler && npm install --save-dev --save-exact vercel@59.18.0`
Expected: `package.json` devDependencies no longer contain `wrangler` and contain `"vercel": "59.18.0"`.

- [ ] **Step 2: Validate the dependency tree (CI does this)**

Run: `npm ls --all > /dev/null && echo TREE_OK`
Expected: `TREE_OK`.

- [ ] **Step 3: Rewrite the deploy target**

In `www/analog/project.json`, replace the `deploy` target with:

```json
    "deploy": {
      "executor": "nx:run-commands",
      "dependsOn": ["build"],
      "options": {
        "command": "npx vercel deploy --prebuilt --yes"
      }
    }
```

- [ ] **Step 4: Delete the Wrangler config**

Run: `git rm www/analog/wrangler.toml`

- [ ] **Step 5: Rewrite DEPLOY.md**

Replace `www/analog/DEPLOY.md` with:

```markdown
# Deploying `www` to Vercel

Vercel hosts the `www` site as one Node.js function (SSR and `/_/chat`) plus
static assets. Nitro's `vercel` preset in `vite.config.ts` writes a Build
Output API tree to `.vercel/output` at the repository root (Analog pins the
Nitro output to its `workspaceRoot`); nothing else configures the deployment.

## Build

- Command: `npx nx build www --configuration=production`
- Output: `<repo-root>/.vercel/output` (`config.json`, `static/`,
  `functions/__server.func/`)

## Environment

`OPENAI_API_KEY` is a Vercel project environment variable for Production and
Preview. `OPENAI_MODEL` and `OPENAI_BASE_URL` are optional overrides. The
`/_/chat` route reads them from `process.env`.

## Automated deployment

`.github/workflows/pr-main.yml` validates changes, then calls
`.github/workflows/deploy.yml`:

- Pull requests from branches in this repository get a preview deployment
  for each affected target. Each deployment is recorded as a GitHub
  Deployment in the `preview` environment, so the URL appears in the pull
  request sidebar. A preview failure fails the `PR Gate` check.
- Pushes to `main` deploy every target to production after validation
  succeeds. Runs are serialized by the `deploy-production` concurrency group.
- Forks and Dependabot pull requests receive CI only.

Targets are declared in the `DEPLOY_TARGETS` environment variable of
`pr-main.yml`. `dir` is the directory that contains `.vercel/output` and is passed to
`vercel --cwd`. Each target needs a `VERCEL_PROJECT_ID_<KEY>` repository
secret; `VERCEL_TOKEN` and `VERCEL_ORG_ID` are shared.

## Manual deployment

One-time: `npx vercel login`, then `npx vercel link` from the repository root
and pick the `hashbrown-www` project (`.vercel/` is ignored by git).

- Preview: `npx nx deploy www`
- Production: `npx nx deploy www -- --prod`

## Provisioning

`node tools/vercel/bootstrap.mjs --env-file <path>` creates the Vercel
project, environment variables, domains, and GitHub secrets, and can tear down
the former Cloudflare Pages projects. See the script header for options.

## Local preview

- Terminal 1: `npx nx run www:build:development --watch`
- Terminal 2: `npx nx serve www`
```

- [ ] **Step 6: Run the artifact test again (the deploy-command assertion)**

Run: `node --test www/analog/e2e/deployment-artifact.e2e.test.mjs`
Expected: pass (the build output from Task 3 is still present).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json www/analog/project.json www/analog/DEPLOY.md
git commit -m "build(www): deploy with the Vercel CLI instead of Wrangler

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Remove the Cloudflare deployer and sample Pages Functions

**Files:**
- Delete: `tools/cloudflare/**`
- Delete: `samples/{finance,fast-food,smart-home}/cloudflare/**`
- Delete: `samples/{finance,fast-food,smart-home}/angular/functions/**`
- Delete: `samples/{finance,fast-food,smart-home}/angular/wrangler.toml`
- Modify: `samples/{finance,fast-food,smart-home}/angular/project.json`
- Modify: `AGENTS.md:109-166`, `docs/release-runbook.md:41-42`

- [ ] **Step 1: Delete files**

```bash
git rm -r tools/cloudflare \
  samples/finance/cloudflare samples/fast-food/cloudflare samples/smart-home/cloudflare \
  samples/finance/angular/functions samples/fast-food/angular/functions samples/smart-home/angular/functions \
  samples/finance/angular/wrangler.toml samples/fast-food/angular/wrangler.toml samples/smart-home/angular/wrangler.toml
```

- [ ] **Step 2: Remove the sample `deploy` targets**

In each of `samples/finance/angular/project.json`, `samples/fast-food/angular/project.json`, `samples/smart-home/angular/project.json`, delete the `deploy` target block (it is the last target in each file):

```json
    "deploy": {
      "executor": "nx:run-commands",
      "dependsOn": ["build:production"],
      "options": {
        "command": "npx wrangler pages deploy dist/samples/<name>/angular/browser --commit-dirty=true"
      }
    }
```

and remove the trailing comma on the preceding target so the JSON stays valid.

- [ ] **Step 3: Update AGENTS.md**

Remove these lines from the "Samples / apps" list in `AGENTS.md`:

```
  - `npx nx deploy fast-food-angular`
- `fast-food-cloudflare`
  - `npx nx build fast-food-cloudflare`
  - `npx nx serve fast-food-cloudflare`
  - `npx nx generate-data fast-food-cloudflare`
```
```
  - `npx nx deploy finance-angular`
- `finance-cloudflare`
  - `npx nx build finance-cloudflare`
  - `npx nx serve finance-cloudflare`
  - `npx nx generate-data finance-cloudflare`
```
```
  - `npx nx deploy smart-home-angular`
- `smart-home-cloudflare`
  - `npx nx build smart-home-cloudflare`
  - `npx nx serve smart-home-cloudflare`
```

Under "### Docs site", keep `npx nx deploy www`.

- [ ] **Step 4: Update the release runbook**

In `docs/release-runbook.md`, delete the two lines:

```
npx nx test cloudflare-deployment
npx nx lint cloudflare-deployment
```

- [ ] **Step 5: Verify the project graph and no stray references**

Run: `npx nx show projects --type=app | sort && grep -rn "wrangler\|cloudflare" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude=CHANGELOG.md --exclude=package-lock.json --exclude-dir=docs . || echo NO_REFS`

Expected: the project list contains no `*-cloudflare` or `cloudflare-deployment` entries. The grep prints only `www/analog/src/app/components/home/Features.ts` (library marketing copy, intentionally kept) and `.github/workflows/pr-main.yml` (rewritten in Task 7); nothing else.

- [ ] **Step 6: Format and lint touched JSON/Markdown**

Run: `npx prettier --write samples/*/angular/project.json AGENTS.md docs/release-runbook.md && npx nx run-many -t lint -p finance-angular fast-food-angular smart-home-angular`
Expected: lint passes.

- [ ] **Step 7: Commit**

```bash
git add -A tools samples AGENTS.md docs/release-runbook.md
git commit -m "chore: remove Cloudflare Pages deployment tooling and functions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Create the reusable deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Deploy

on:
  workflow_call:
    inputs:
      environment:
        description: preview or production
        required: true
        type: string
      targets:
        description: JSON array of { key, dir, project_id_secret }
        required: true
        type: string
      ref:
        description: Commit SHA to build and deploy
        required: true
        type: string
      branch:
        description: Git branch name recorded on the Vercel deployment
        required: true
        type: string

permissions:
  contents: read

jobs:
  deploy:
    name: ${{ inputs.environment }} / ${{ matrix.key }}
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
      deployments: write
    strategy:
      fail-fast: false
      matrix:
        include: ${{ fromJSON(inputs.targets) }}
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets[matrix.project_id_secret] }}
    steps:
      - name: Checkout
        uses: actions/checkout@v7
        with:
          ref: ${{ inputs.ref }}
          persist-credentials: false

      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version-file: '.nvmrc'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npx nx build "${{ matrix.key }}" --configuration=production

      - name: Create GitHub deployment
        id: deployment
        env:
          GH_TOKEN: ${{ github.token }}
          REF: ${{ inputs.ref }}
          ENVIRONMENT: ${{ inputs.environment }}
          KEY: ${{ matrix.key }}
        run: |
          payload="$(jq -n \
            --arg ref "$REF" \
            --arg environment "$ENVIRONMENT" \
            --arg task "deploy:$KEY" \
            --argjson production "$([[ "$ENVIRONMENT" == "production" ]] && echo true || echo false)" \
            '{
              ref: $ref,
              environment: $environment,
              task: $task,
              auto_merge: false,
              required_contexts: [],
              transient_environment: ($production | not),
              production_environment: $production,
              description: ("Vercel " + $environment + " deployment for " + $task)
            }')"
          id="$(gh api "repos/${GITHUB_REPOSITORY}/deployments" --input - --jq '.id' <<<"$payload")"
          echo "id=$id" >> "$GITHUB_OUTPUT"

      - name: Deploy to Vercel
        id: deploy
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          DIR: ${{ matrix.dir }}
          ENVIRONMENT: ${{ inputs.environment }}
          BRANCH: ${{ inputs.branch }}
          SHA: ${{ inputs.ref }}
        run: |
          args=(deploy --prebuilt --yes --cwd "$DIR" --token "$VERCEL_TOKEN"
            -m githubDeployment=1
            -m "githubCommitRef=$BRANCH"
            -m "githubCommitSha=$SHA"
            -m "githubCommitRepo=${GITHUB_REPOSITORY#*/}"
            -m "githubOrg=${GITHUB_REPOSITORY_OWNER}")
          if [[ "$ENVIRONMENT" == "production" ]]; then
            args+=(--prod)
          fi
          url="$(npx vercel "${args[@]}")"
          echo "url=$url" >> "$GITHUB_OUTPUT"
          echo "Deployed $DIR to $url"

      - name: Record deployment status
        if: always() && steps.deployment.outputs.id != ''
        env:
          GH_TOKEN: ${{ github.token }}
          DEPLOYMENT_ID: ${{ steps.deployment.outputs.id }}
          OUTCOME: ${{ steps.deploy.outcome }}
          URL: ${{ steps.deploy.outputs.url }}
          ENVIRONMENT: ${{ inputs.environment }}
        run: |
          state=failure
          if [[ "$OUTCOME" == "success" ]]; then
            state=success
          fi
          payload="$(jq -n \
            --arg state "$state" \
            --arg url "$URL" \
            --arg log_url "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}" \
            --argjson auto_inactive "$([[ "$ENVIRONMENT" == "production" ]] && echo true || echo false)" \
            '{ state: $state, log_url: $log_url, auto_inactive: $auto_inactive }
             + (if $url == "" then {} else { environment_url: $url } end)')"
          gh api "repos/${GITHUB_REPOSITORY}/deployments/${DEPLOYMENT_ID}/statuses" \
            -H "Accept: application/vnd.github+json" --input - <<<"$payload" > /dev/null
```

- [ ] **Step 2: Lint the YAML**

Run: `node -e "const y=require('yaml');y.parse(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'));console.log('YAML_OK')"`
Expected: `YAML_OK` (the `yaml` package is a workspace dependency).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add reusable Vercel deploy workflow

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Rewrite pr-main.yml around target selection

**Files:**
- Modify: `.github/workflows/pr-main.yml`

- [ ] **Step 1: Replace the file**

```yaml
name: PR / Main CI

on:
  workflow_dispatch:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: pr-main-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

env:
  # Deployment targets. key = Nx project, dir = directory containing .vercel/output.
  DEPLOY_TARGETS: >-
    [
      { "key": "www", "dir": ".", "project_id_secret": "VERCEL_PROJECT_ID_WWW" }
    ]

jobs:
  ci:
    name: Lint, Test, Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version-file: '.nvmrc'
          cache: npm

      - name: Determine affected base
        uses: nrwl/nx-set-shas@v3

      - name: Install dependencies
        run: npm ci

      - name: Cache Playwright browsers
        uses: actions/cache@v5
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      - name: Validate dependency tree
        run: npm ls --all

      - name: Validate affected projects
        run: npx nx affected -t lint,test,typecheck,build,e2e --parallel=3

      - name: Validate smart-home React tooling
        run: npx nx run-many -t eslint:lint,build-storybook -p smart-home-react --parallel=2

      - name: Verify affected real examples
        run: npx nx affected -t example-e2e --parallel=1

      - name: Upload runtime smoke diagnostics
        if: failure()
        uses: actions/upload-artifact@v6
        with:
          name: runtime-smoke-diagnostics
          path: |
            test-results/runtime-smoke
            playwright-report/runtime-smoke
            test-results/examples
            playwright-report/examples
          retention-days: 7
          if-no-files-found: ignore

  targets:
    name: Select deployment targets
    if: >-
      (github.event_name == 'pull_request' &&
       github.event.pull_request.head.repo.full_name == github.repository &&
       github.event.pull_request.user.login != 'dependabot[bot]') ||
      (github.event_name != 'pull_request' && github.ref == 'refs/heads/main')
    runs-on: ubuntu-latest
    timeout-minutes: 10
    outputs:
      matrix: ${{ steps.select.outputs.matrix }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Setup Node.js
        if: github.event_name == 'pull_request'
        uses: actions/setup-node@v7
        with:
          node-version-file: '.nvmrc'
          cache: npm

      - name: Install dependencies
        if: github.event_name == 'pull_request'
        run: npm ci

      - name: Select targets
        id: select
        env:
          EVENT: ${{ github.event_name }}
          BASE: ${{ github.event.pull_request.base.sha }}
          HEAD: ${{ github.event.pull_request.head.sha }}
        run: |
          if [[ "$EVENT" != "pull_request" ]]; then
            selected="$(jq -c . <<<"$DEPLOY_TARGETS")"
          elif git diff --name-only "$BASE...$HEAD" | grep -qxE '\.github/workflows/(pr-main|deploy)\.yml'; then
            echo "Deployment workflow changed; selecting all targets."
            selected="$(jq -c . <<<"$DEPLOY_TARGETS")"
          else
            affected="$(npx nx show projects --affected --base="$BASE" --head="$HEAD" --withTarget=build --type=app --json)"
            selected="$(jq -c --argjson affected "$affected" \
              '[ .[] | select(.key as $key | $affected | index($key) != null) ]' <<<"$DEPLOY_TARGETS")"
          fi
          echo "Selected targets: $selected"
          echo "matrix=$selected" >> "$GITHUB_OUTPUT"

  preview:
    name: Preview
    needs: [ci, targets]
    if: >-
      github.event_name == 'pull_request' &&
      needs.targets.outputs.matrix != '' &&
      needs.targets.outputs.matrix != '[]'
    permissions:
      contents: read
      deployments: write
    uses: ./.github/workflows/deploy.yml
    with:
      environment: preview
      targets: ${{ needs.targets.outputs.matrix }}
      ref: ${{ github.event.pull_request.head.sha }}
      branch: ${{ github.event.pull_request.head.ref }}
    secrets: inherit

  production:
    name: Production
    needs: [ci, targets]
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    permissions:
      contents: read
      deployments: write
    uses: ./.github/workflows/deploy.yml
    with:
      environment: production
      targets: ${{ needs.targets.outputs.matrix }}
      ref: ${{ github.sha }}
      branch: main
    secrets: inherit

  pr-gate:
    name: PR Gate
    if: ${{ always() && github.event_name == 'pull_request' }}
    needs: [ci, targets, preview]
    runs-on: ubuntu-latest
    steps:
      - name: Verify required jobs
        env:
          CI_RESULT: ${{ needs.ci.result }}
          TARGETS_RESULT: ${{ needs.targets.result }}
          PREVIEW_RESULT: ${{ needs.preview.result }}
        run: |
          if [[ "$CI_RESULT" != "success" ]]; then
            echo "Validation result: $CI_RESULT"
            exit 1
          fi

          if [[ "$TARGETS_RESULT" != "success" && "$TARGETS_RESULT" != "skipped" ]]; then
            echo "Target selection result: $TARGETS_RESULT"
            exit 1
          fi

          if [[ "$PREVIEW_RESULT" != "success" && "$PREVIEW_RESULT" != "skipped" ]]; then
            echo "Preview result: $PREVIEW_RESULT"
            exit 1
          fi
```

- [ ] **Step 2: Lint the YAML**

Run: `node -e "const y=require('yaml');const d=y.parse(require('fs').readFileSync('.github/workflows/pr-main.yml','utf8'));JSON.parse(d.env.DEPLOY_TARGETS);console.log('YAML_OK', Object.keys(d.jobs).join(','))"`
Expected: `YAML_OK ci,targets,preview,production,pr-gate`.

- [ ] **Step 3: Confirm no Cloudflare references remain outside docs and marketing copy**

Run: `git grep -n -i "wrangler\|cloudflare" -- ':!package-lock.json' ':!CHANGELOG.md' ':!docs/superpowers' ':!docs/security'`
Expected: exactly two hits — `www/analog/DEPLOY.md` (describes the optional Cloudflare teardown) and `www/analog/src/app/components/home/Features.ts` (library runtime copy).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pr-main.yml
git commit -m "ci: deploy previews and production to Vercel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Bootstrap script — API client and idempotent operations (TDD)

**Files:**
- Create: `tools/vercel/bootstrap.mjs`
- Create: `tools/vercel/bootstrap.test.mjs`
- Create: `tools/vercel/project.json`

- [ ] **Step 1: Register the Nx project**

Create `tools/vercel/project.json`:

```json
{
  "name": "vercel-bootstrap",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "tools/vercel",
  "projectType": "application",
  "tags": [],
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": {
        "command": "eslint tools/vercel",
        "forwardAllArgs": false
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": {
        "command": "node --test tools/vercel/*.test.mjs"
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tools/vercel/bootstrap.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createVercelClient,
  ensureDomain,
  ensureProject,
  missingDnsRecords,
  upsertEnv,
} from './bootstrap.mjs';

function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname + new URL(url).search;
    calls.push({ method, path, body: init.body ? JSON.parse(init.body) : undefined });
    const handler = routes[`${method} ${path}`];
    if (!handler) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: path } }), { status: 404 });
    }
    const { status = 200, body = {} } = typeof handler === 'function' ? handler() : handler;
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

test('createVercelClient sends a bearer token and throws on non-2xx', async () => {
  const seen = [];
  const vercel = createVercelClient('tok', async (url, init) => {
    seen.push(init.headers.authorization);
    return new Response(JSON.stringify({ error: { code: 'forbidden', message: 'nope' } }), { status: 403 });
  });

  await assert.rejects(() => vercel('GET', '/v2/user'), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.code, 'forbidden');
    return true;
  });
  assert.deepEqual(seen, ['Bearer tok']);
});

test('ensureProject returns the existing project without creating', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/hashbrown-www': { body: { id: 'prj_1', name: 'hashbrown-www' } },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const result = await ensureProject(vercel, 'hashbrown-www');

  assert.equal(result.status, 'exists');
  assert.equal(result.project.id, 'prj_1');
  assert.deepEqual(calls.map((call) => call.method), ['GET']);
});

test('ensureProject creates a framework-less project when missing', async () => {
  const { fetchImpl, calls } = stubFetch({
    'POST /v11/projects': { body: { id: 'prj_2', name: 'hashbrown-www' } },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const result = await ensureProject(vercel, 'hashbrown-www');

  assert.equal(result.status, 'created');
  assert.deepEqual(calls[1].body, { name: 'hashbrown-www', framework: null });
});

test('upsertEnv skips empty values and targets production and preview', async () => {
  const { fetchImpl, calls } = stubFetch({
    'POST /v10/projects/prj_1/env?upsert=true': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(await upsertEnv(vercel, 'prj_1', { OPENAI_API_KEY: '', OPENAI_MODEL: undefined }), 'skipped');
  assert.equal(await upsertEnv(vercel, 'prj_1', { OPENAI_API_KEY: 'sk-test' }), 'updated');
  assert.deepEqual(calls.at(-1).body, [
    { key: 'OPENAI_API_KEY', value: 'sk-test', type: 'encrypted', target: ['production', 'preview'] },
  ]);
});

test('ensureDomain treats an existing project domain as exists', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/prj_1/domains/www.hashbrown.dev': { body: { name: 'www.hashbrown.dev' } },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(await ensureDomain(vercel, 'prj_1', { name: 'www.hashbrown.dev' }), 'exists');
  assert.equal(calls.length, 1);
});

test('missingDnsRecords compares name, type and value', () => {
  const existing = [
    { name: '', type: 'MX', value: 'mail.example.com.' },
    { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none' },
  ];
  const wanted = [
    { name: '', type: 'MX', value: 'mail.example.com.', mxPriority: 10 },
    { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none' },
    { name: 'blog', type: 'CNAME', value: 'ghs.googlehosted.com.' },
  ];

  assert.deepEqual(missingDnsRecords(existing, wanted), [wanted[2]]);
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `node --test tools/vercel/bootstrap.test.mjs`
Expected: fails with `Cannot find module '.../tools/vercel/bootstrap.mjs'`.

- [ ] **Step 4: Write the script**

Create `tools/vercel/bootstrap.mjs`:

```js
#!/usr/bin/env node
/**
 * One-time, re-runnable provisioning for Hashbrown's Vercel deployment.
 *
 *   node tools/vercel/bootstrap.mjs --env-file /path/to/.env [--dns-records records.json] [--skip-workflow]
 *
 * Environment (from --env-file or the process):
 *   VERCEL_TOKEN or VERCEL_API_TOKEN   required
 *   OPENAI_API_KEY                     required; set on the project, never printed
 *   OPENAI_MODEL, OPENAI_BASE_URL      optional overrides
 *   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID  optional; enables Pages teardown
 *
 * --dns-records points at a JSON array of Vercel DNS records
 *   [{ "name": "", "type": "MX", "value": "mail.example.com.", "mxPriority": 10, "ttl": 3600 }]
 * Apex and www routing records are managed by Vercel and must not be listed.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseArgs, promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);

export const VERCEL_API = 'https://api.vercel.com';
export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
export const REPOSITORY = 'liveloveapp/hashbrown';
export const DOMAIN = 'hashbrown.dev';
export const NODE_VERSION = '24.x';
export const TARGETS = Object.freeze([
  Object.freeze({
    key: 'www',
    project: 'hashbrown-www',
    secret: 'VERCEL_PROJECT_ID_WWW',
  }),
]);
export const CLOUDFLARE_PAGES_PROJECTS = Object.freeze([
  'hashbrown-www',
  'hashbrown-finance',
  'hashbrown-fast-food',
  'hashbrown-smart-home',
]);

/** Minimal Vercel REST client: bearer auth, JSON bodies, errors carry status/code. */
export function createVercelClient(token, fetchImpl = fetch) {
  return async function vercel(method, path, body) {
    const response = await fetchImpl(`${VERCEL_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      const error = new Error(
        `${method} ${path} -> ${response.status}: ${data?.error?.message ?? text}`,
      );
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }

    return data;
  };
}

function isNotFound(error) {
  return error?.status === 404;
}

export async function ensureProject(vercel, name) {
  try {
    const project = await vercel('GET', `/v9/projects/${name}`);
    return { status: 'exists', project };
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const project = await vercel('POST', '/v11/projects', {
    name,
    framework: null,
  });
  return { status: 'created', project };
}

export async function ensureNodeVersion(vercel, project) {
  if (project.nodeVersion === NODE_VERSION) return 'exists';
  await vercel('PATCH', `/v9/projects/${project.id}`, {
    nodeVersion: NODE_VERSION,
  });
  return 'updated';
}

export async function upsertEnv(vercel, projectId, variables) {
  const entries = Object.entries(variables)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key, value]) => ({
      key,
      value,
      type: 'encrypted',
      target: ['production', 'preview'],
    }));

  if (entries.length === 0) return 'skipped';
  await vercel('POST', `/v10/projects/${projectId}/env?upsert=true`, entries);
  return 'updated';
}

export async function ensureDomain(vercel, projectId, domain) {
  try {
    await vercel('GET', `/v9/projects/${projectId}/domains/${domain.name}`);
    return 'exists';
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  await vercel('POST', `/v10/projects/${projectId}/domains`, domain);
  return 'created';
}

export function missingDnsRecords(existing, wanted) {
  return wanted.filter(
    (record) =>
      !existing.some(
        (candidate) =>
          candidate.name === record.name &&
          candidate.type === record.type &&
          candidate.value === record.value,
      ),
  );
}

export async function ensureDnsRecords(vercel, domain, wanted) {
  const { records } = await vercel(
    'GET',
    `/v4/domains/${domain}/records?limit=100`,
  );
  const missing = missingDnsRecords(records, wanted);

  for (const record of missing) {
    await vercel('POST', `/v2/domains/${domain}/records`, record);
  }

  return { created: missing.length, existing: wanted.length - missing.length };
}

export async function readDomainState(vercel, projectId) {
  const projectDomain = await vercel(
    'GET',
    `/v9/projects/${projectId}/domains/${DOMAIN}`,
  );
  let nameservers = ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'];
  try {
    const { domain } = await vercel('GET', `/v5/domains/${DOMAIN}`);
    nameservers = domain.intendedNameservers ?? nameservers;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  return { verified: projectDomain.verified === true, nameservers };
}

export async function deleteCloudflarePagesProjects({
  token,
  accountId,
  fetchImpl = fetch,
}) {
  const results = {};

  for (const name of CLOUDFLARE_PAGES_PROJECTS) {
    const response = await fetchImpl(
      `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects/${name}`,
      { method: 'DELETE', headers: { authorization: `Bearer ${token}` } },
    );
    if (response.status === 404) {
      results[name] = 'skipped';
    } else if (response.ok) {
      results[name] = 'deleted';
    } else {
      throw new Error(`Cloudflare delete ${name} -> ${response.status}`);
    }
  }

  return results;
}

async function gh(args) {
  const { stdout } = await exec('gh', args, {
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  });
  return stdout.trim();
}

async function setSecret(name, value) {
  await gh(['secret', 'set', name, '--repo', REPOSITORY, '--body', value]);
}

async function deleteSecret(name) {
  try {
    await gh(['secret', 'delete', name, '--repo', REPOSITORY]);
    return 'deleted';
  } catch (error) {
    if (/not found/i.test(error.stderr ?? '')) return 'skipped';
    throw error;
  }
}

function log(step, outcome, detail = '') {
  console.log(`${step.padEnd(22)} ${outcome}${detail ? `  ${detail}` : ''}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      'env-file': { type: 'string' },
      'dns-records': { type: 'string' },
      'skip-workflow': { type: 'boolean', default: false },
    },
  });

  if (values['env-file']) process.loadEnvFile(values['env-file']);

  const token = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN or VERCEL_API_TOKEN is required.');
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required.');
  }

  const vercel = createVercelClient(token);
  const { user } = await vercel('GET', '/v2/user');
  log('vercel user', user.username);

  for (const target of TARGETS) {
    const { status, project } = await ensureProject(vercel, target.project);
    log(`project ${target.project}`, status, project.id);
    log('node version', await ensureNodeVersion(vercel, project));
    log(
      'env vars',
      await upsertEnv(vercel, project.id, {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      }),
    );

    if (target.key === 'www') {
      log('domain apex', await ensureDomain(vercel, project.id, { name: DOMAIN }));
      log(
        'domain www',
        await ensureDomain(vercel, project.id, {
          name: `www.${DOMAIN}`,
          redirect: DOMAIN,
          redirectStatusCode: 308,
        }),
      );

      if (values['dns-records']) {
        const wanted = JSON.parse(await readFile(values['dns-records'], 'utf8'));
        const { created, existing } = await ensureDnsRecords(vercel, DOMAIN, wanted);
        log('dns records', `created ${created}, existing ${existing}`);
      }
    }

    await setSecret(target.secret, project.id);
    log(`secret ${target.secret}`, 'set');
  }

  await setSecret('VERCEL_TOKEN', token);
  await setSecret('VERCEL_ORG_ID', user.id);
  log('secrets VERCEL_*', 'set');

  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    const results = await deleteCloudflarePagesProjects({
      token: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    });
    for (const [name, outcome] of Object.entries(results)) {
      log(`cloudflare ${name}`, outcome);
    }
    log('secret CLOUDFLARE_API_TOKEN', await deleteSecret('CLOUDFLARE_API_TOKEN'));
    log('secret CLOUDFLARE_ACCOUNT_ID', await deleteSecret('CLOUDFLARE_ACCOUNT_ID'));
  } else {
    log('cloudflare teardown', 'skipped', 'set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to enable');
  }

  if (!values['skip-workflow']) {
    await gh(['workflow', 'run', 'pr-main.yml', '--ref', 'main', '--repo', REPOSITORY]);
    log('workflow pr-main.yml', 'dispatched', `https://github.com/${REPOSITORY}/actions/workflows/pr-main.yml`);
  }

  const www = TARGETS.find((target) => target.key === 'www');
  const { project } = await ensureProject(vercel, www.project);
  const { verified, nameservers } = await readDomainState(vercel, project.id);
  log(`domain ${DOMAIN}`, verified ? 'verified' : 'pending nameservers');
  if (!verified) {
    console.log(`\nSet these nameservers at the registrar (Squarespace), then re-run this script:\n  ${nameservers.join('\n  ')}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test tools/vercel/bootstrap.test.mjs`
Expected: 6 passing, 0 failing.

- [ ] **Step 6: Lint**

Run: `npx nx lint vercel-bootstrap`
Expected: pass. If ESLint flags `error.status`/`error.code` assignment or `console`, fix by following the same rules the repo applies to `tools/runtime-smoke` (check its eslint config for precedent) rather than disabling rules inline.

- [ ] **Step 7: Commit**

```bash
git add tools/vercel
git commit -m "chore: add Vercel provisioning bootstrap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Full local verification

**Files:** none

- [ ] **Step 1: Run the affected validation the way CI does**

Run: `npx nx affected -t lint,test,typecheck,build --base=main --parallel=3`
Expected: pass. (`e2e` for `www` already ran in Task 3.)

- [ ] **Step 2: Confirm the www artifact once more from a clean output**

Run: `npx nx e2e www --skip-nx-cache`
Expected: pass.

- [ ] **Step 3: Prettier check on everything touched**

Run: `npx prettier --check .github/workflows tools/vercel www/analog/DEPLOY.md www/analog/project.json www/analog/vite.config.ts www/analog/src/server/routes/_/chat.post.ts www/analog/e2e`
Expected: `All matched files use Prettier code style!` — otherwise `--write` and amend the relevant commit.

---

### Task 10: Open the pull request

**Files:** none

- [ ] **Step 1: Push and open**

```bash
git push -u origin blove/hashbrown-vercel-migration-66856c
gh pr create --title "ci: migrate website deployment from Cloudflare Pages to Vercel" --body "$(cat <<'EOF'
## Summary

- `www` builds a Vercel Build Output API tree via Nitro's `vercel` preset (Node runtime, Fluid compute, streaming on, `maxDuration` 300).
- New reusable `deploy.yml` deploys a matrix of targets with `vercel deploy --prebuilt` and records each as a GitHub Deployment; `pr-main.yml` selects affected targets for previews and deploys production on `main`.
- `/_/chat` reads secrets from `process.env` and sets `no-transform` / `X-Accel-Buffering: no`.
- Removes `tools/cloudflare`, all `wrangler.toml` files, the samples' Pages Functions, and the `wrangler` dependency; adds `tools/vercel/bootstrap.mjs` for provisioning.

Spec: `docs/superpowers/specs/2026-09-15-vercel-deployment-design.md`

## Rollout

The preview job on this PR is skipped until the `VERCEL_*` secrets exist (bootstrap, Task 11). Production deploys on merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Note the outcome**

Before bootstrap runs, `targets` selects `www` (the workflow files changed) and `preview` fails because `VERCEL_PROJECT_ID_WWW` is empty. That is expected; Task 11 fixes it and Task 12 re-runs.

---

### Task 11: Provision Vercel (requires the user's token file)

**Files:** none (runs against Vercel, GitHub, and optionally Cloudflare)

- [ ] **Step 1: Confirm the token file has what the script needs, without printing values**

Run: `grep -o '^\(VERCEL_API_TOKEN\|VERCEL_TOKEN\|OPENAI_API_KEY\|CLOUDFLARE_API_TOKEN\|CLOUDFLARE_ACCOUNT_ID\)=' /Users/blove/repos/hashbrown/.env`
Expected: at least `VERCEL_API_TOKEN=` and `OPENAI_API_KEY=`. If the Cloudflare pair is absent, teardown is skipped and can be run later by re-invoking the script once they are added.

- [ ] **Step 2: Ask the user whether hashbrown.dev has extra DNS records to carry over (MX, TXT, other subdomains)**

If yes, they write them to `/private/tmp/claude-501/-Users-blove-repos-hashbrown--claude-worktrees-homepage-v0-5-refresh-0d5f43/ab15d2ea-a944-4850-a80a-6ad068a7daa8/scratchpad/dns-records.json` in the format documented in the script header, and Step 3 adds `--dns-records <that path>`. If no, omit the flag. The file is outside the repo, so nothing is committed.

- [ ] **Step 3: Run the bootstrap without dispatching the workflow**

Run: `node tools/vercel/bootstrap.mjs --env-file /Users/blove/repos/hashbrown/.env --skip-workflow`
(Cloudflare teardown is opt-in via `--teardown-cloudflare` and must NOT be passed here; the Pages projects stay live until Vercel serves the domain in Task 13.)
Expected output shape:

```
vercel user            <username>
project hashbrown-www  created  prj_...
node version           updated
env vars               updated
domain apex            created
domain www             created
secret VERCEL_PROJECT_ID_WWW set
secrets VERCEL_*       set
cloudflare teardown    skipped  pass --teardown-cloudflare after the domain is verified
domain hashbrown.dev   pending nameservers

Set these nameservers at the registrar (Squarespace), then re-run this script:
  <nameservers reported by Vercel for this domain>
```

If Vercel has not yet reported intended nameservers, the script says so and points to the dashboard; take the values from the domain's page there.

- [ ] **Step 4: Confirm the secrets exist**

Run: `gh secret list --repo liveloveapp/hashbrown | grep -E 'VERCEL_(TOKEN|ORG_ID|PROJECT_ID_WWW)'`
Expected: three lines.

---

### Task 12: Prove the preview pipeline

**Files:** none

- [ ] **Step 1: Re-run the PR workflow**

Run: `gh run list --repo liveloveapp/hashbrown --branch blove/hashbrown-vercel-migration-66856c --workflow pr-main.yml --limit 1 --json databaseId --jq '.[0].databaseId' | xargs -I{} gh run rerun {} --repo liveloveapp/hashbrown`
Then: `gh run watch --repo liveloveapp/hashbrown --exit-status` (pick the new run when prompted, or pass its id).
Expected: `ci`, `targets`, `Preview / preview / www`, and `PR Gate` all succeed.

- [ ] **Step 2: Read the deployment URL from the GitHub Deployment**

Run: `gh api "repos/liveloveapp/hashbrown/deployments?environment=preview&sha=$(git rev-parse HEAD)" --jq '.[0].id' | xargs -I{} gh api repos/liveloveapp/hashbrown/deployments/{}/statuses --jq '.[0] | {state, environment_url}'`
Expected: `{"state":"success","environment_url":"https://hashbrown-www-....vercel.app"}`.

- [ ] **Step 3: Verify SSR and streaming on the preview**

```bash
url="<environment_url from step 2>"
curl -sS "$url/docs/angular/start/quick" | grep -o 'Angular Quick Start' | head -1
curl -sSN -X POST "$url/_/chat" -H 'content-type: application/json' \
  --data '{"threadId":"t1","runId":"r1","messages":[{"id":"m1","role":"user","content":"Say hi in three words."}],"tools":[],"context":[],"state":{},"forwardedProps":{}}' \
  | head -c 600
```
Expected: the first command prints `Angular Quick Start`; the second prints several `data: {...}` SSE lines that appear progressively (not one burst at the end) and begin with a `RUN_STARTED` event. The body is a minimal AG-UI `RunAgentInput` (same shape as `packages/core/src/transport/local-text-event-stream.spec.ts` plus one user message).

- [ ] **Step 4: Check the PR sidebar**

Run: `gh pr view --repo liveloveapp/hashbrown --json url --jq .url` and open it. Expected: a "preview" deployment card with "View deployment" pointing at the same URL.

---

### Task 13: Merge, cut over, tear down

**Files:** none

- [ ] **Step 1: Merge after review**

The user merges (squash). `production` runs with `--prod`; `gh run watch` on the `main` run should show `Production / production / www` succeeding.

- [ ] **Step 2: Verify production on the Vercel URL before DNS**

Run: `gh api "repos/liveloveapp/hashbrown/deployments?environment=production" --jq '.[0].id' | xargs -I{} gh api repos/liveloveapp/hashbrown/deployments/{}/statuses --jq '.[0].environment_url'`
Then `curl -sS "<url>/docs/angular/start/quick" | grep -c 'Angular Quick Start'` → `1`.

- [ ] **Step 3: User switches nameservers at Squarespace** to the nameservers the bootstrap printed for `hashbrown.dev` (also shown on the domain page in the Vercel dashboard).

- [ ] **Step 4: Confirm the domain and teardown**

Re-run: `node tools/vercel/bootstrap.mjs --env-file /Users/blove/repos/hashbrown/.env --skip-workflow`
Expected: every step reports `exists`/`skipped`, and `domain hashbrown.dev   verified`.

Only once the domain is verified and `https://hashbrown.dev` serves from Vercel, tear down Cloudflare: `node tools/vercel/bootstrap.mjs --env-file /Users/blove/repos/hashbrown/.env --skip-workflow --teardown-cloudflare` (requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the env file). This deletes the four Pages projects and the two `CLOUDFLARE_*` GitHub secrets.

- [ ] **Step 5: Final production check on the real domain**

Run: `curl -sSI https://hashbrown.dev | grep -i '^server:'` → `server: Vercel`, and repeat the `/_/chat` curl from Task 12 Step 3 against `https://hashbrown.dev`.

---

## Amendments applied during execution

- The Vercel Build Output API tree lands at `<repo-root>/.vercel/output` (Analog pins Nitro output to its `workspaceRoot`); the deploy target `dir` is `.` and the function directory is `functions/__server.func`.
- `deploy.yml` fails closed when `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` are empty or `environment` is invalid, drops `--token` in favour of the `VERCEL_TOKEN` env var, adds `githubRepo`/`githubCommitOrg` meta, asserts the captured URL, and skips the status post on cancellation.
- `pr-main.yml` keys concurrency on the ref only (push and dispatch on `main` share one group), sets `timeout-minutes` on `ci` and `pr-gate`, launders `nx show projects` output, and guards `production` against an empty matrix.
- `tools/vercel/bootstrap.mjs`: Cloudflare teardown is opt-in (`--teardown-cloudflare`); the DNS list uses `/v5`; env upserts surface `failed[]`; nameservers are never guessed; the `www` redirect is reconciled on re-run; the token reaches `gh secret set` via stdin.
- `tools/runtime-smoke/e2e/harness/openai-route.spec.ts` imported the deleted fast-food Pages Function; the worker test was removed and the Express route test kept.
- Vercel answers 403 (not 404) for `GET /v5/domains/{domain}` when the domain is not on the account; the bootstrap tolerates it and reports `GET /v6/domains/{domain}/config` (current nameservers, `misconfigured`, recommended apex A record) instead of guessing nameservers.
- Provisioning ran on 2026-09-16: project `hashbrown-www` created, `OPENAI_API_KEY` set for production+preview, `hashbrown.dev` and `www.hashbrown.dev` attached and ownership-verified, `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID_WWW` set on the repository. DNS still resolves via Cloudflare nameservers until the registrar switch.
- Vercel enables Deployment Protection (SSO) on every new project regardless of plan, which returned 401/302 on the preview; the bootstrap now clears `ssoProtection`/`passwordProtection` (`public previews`) so the public docs site's previews are public.
- The `analog()` `index` option must point at `.vercel/output/static/index.html` for production builds; the old `dist/www/analog/index.html` path no longer exists, and Analog silently falls back to a `<div id="app">` shell (every SSR route then fails with NG05104). The artifact e2e test now boots the built function and renders a docs page.
- Pre-existing, out of scope: server-rendering `/` throws `window is not defined` from `www/analog/src/app/components/hashy-skates/Scene.ts`; it is masked on both hosts because `/` is served as the static client shell. Worth an `isPlatformBrowser`/`afterNextRender` guard in a follow-up.
