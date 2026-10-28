# Installed Threadplane documentation consumers

These checked files are the React and Angular recipe components, mounting code,
hosts, and styles. They are copied into separate disposable applications under
`dist/docs-threadplane`. Each application resolves its installed packages without
repository source aliases. No external dependencies are added to Hashbrown's
package manifests.

React uses published Hashbrown 0.8.0 and local copies of Threadplane's private
core/content/react packages. Angular uses published Threadplane chat/ag-ui 0.3.3
through the official Angular application builder. The helper pins the framework
and build-tool versions; each application's `package-lock.json` records the
resolved peer graph.

## Prepare the pinned React source packages

From this repository's root, create the disposable source checkout:

```sh
git clone https://github.com/cacheplane/threadplane.git dist/docs-threadplane/threadplane
git -C dist/docs-threadplane/threadplane checkout 2c7f01fa958441f3ed94e2559987217be284e94a
```

Run these commands inside `dist/docs-threadplane/threadplane`, one at a time:

```sh
npm ci
npx nx build react
```

This builds the pinned React packages and their workspace dependencies. Keep the
checkout's tracked files unchanged. Preparation verifies the exact revision,
tracked source state, compiled exports, declarations, and chat stylesheet before
installing the local packages. It does not modify or rebuild the source checkout.

## Install and build the consumers

Return to Hashbrown's repository root, then run:

```sh
npx nx docs-threadplane-prepare www
```

The preparation CLI copies the checked files, writes the temporary manifests and
compiler/workspace configurations, installs React dependencies with
`npm install --include=dev --install-links --no-audit --no-fund`, and runs the installed
TypeScript compiler and Vite. It then installs Angular dependencies and runs the
installed Angular CLI's production build. These operations are sequential. React
includes `vite/client` types for its CSS imports; Angular's standard builder
links installed partial-compiled libraries without a hidden JIT compiler import.
Both installs explicitly include development dependencies, including when Nx
sets a production environment. Compiler and bundler realpaths must stay inside
the consumer's own `node_modules`; a parent-workspace fallback fails preparation.

Both applications produce `dist/index.html` below their consumer root. Existing
locks are retained and used by npm; a first installation resolves and writes the
complete lock. Keep the generated manifests, locks, source-verification report,
and installation/build logs with the verification evidence.

To prepare one consumer explicitly:

```sh
npx nx docs-threadplane-prepare www -- --sdk=react
npx nx docs-threadplane-prepare www -- --sdk=angular
```

The Angular-only preparation path doesn't need the React source checkout. The
recorder's default server dependencies live in the React consumer, so prepare
both before running the default recording target.

## Verify and record

Run the recorder after preparation:

```sh
DOCS_SKIP_RECORDING=1 npx nx docs-threadplane-demo www
DOCS_SKIP_RECORDING=1 npx nx docs-threadplane-live-demo www
npx nx docs-threadplane-live-demo www
```

The first command verifies standalone keyboard, error, cancellation and mobile behavior using labelled fixtures, without replacing public captures. The second verifies the canonical shell with real provider output without publishing footage. The third records both frameworks. Both real-provider commands require server-only `OPENAI_API_KEY` and explicit `OPENAI_MODEL` and use separate real React and Angular consumers with the canonical workbench shell. `DOCS_DEMO_MODES`
selects `threadplane-react`, `threadplane-angular`, or both as a comma-separated
list. Unknown modes fail before recording.

The standalone verifier uses the checked server and real Hashbrown OpenAI adapter with a
local provider-native response fixture. Fixture publication is rejected; its test responses never supply the current videos. The live recorder uses actual provider output, the canonical two-step plan and follow-up, and real installed controls inside the LLA shell, inspector and bottom timeline. It verifies request history, shorter second step, unchanged state and inert replay. Both recordings are staged until both real framework conversations pass. It checks package versions, realpaths,
framework runtime identity, installed CSS exports, and browser behavior. The fixture verifier requires no provider key. The optional shell is bundled separately and does not supply framework aliases or packages to the installed consumers. Current clips run at actual speed with reading pauses, measured captions and no narration. They are not additional hosted workbench lesson routes.

Run preparation, recording, and other generated-output targets sequentially.
Preserve `dist/docs-threadplane` capture masters and reports when cleaning up a
development branch. SDK publishing is a separate user-owned step.
