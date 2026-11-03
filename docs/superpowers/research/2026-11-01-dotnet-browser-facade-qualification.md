# Pending-browser recovery framework checkpoint

This records the unreleased Task 5 framework changes on top of core checkpoint `764f1fd1`. It does not qualify a published release, actual browser acceptance, or the later crash-maintenance work.

All seven React hooks and seven Angular resources expose core's pending conversation recovery and explicit settlement command. UI inheritance and internal with-message wrappers retain the same contract. Angular text completion additionally accepts optional tools, preserving its existing input/state generic positions and result type. Injector-bound handlers and default transport factories retain their identity across harmless updates; a changed effective URL still reaches core's configuration guard.

## Executed evidence

- Initial forwarding tests failed on missing public members. Angular text completion also failed genuine registered-tool membership validation because it hardcoded an empty tool list. Actual TypeScript compilation separately rejected the missing public members.
- Seven additional Angular lifecycle cases failed on harmless options updates before the transport/tool identity correction. Core's configuration checks were preserved.
- Final focused suites passed: 26 React and 34 Angular cases. They exercise browser-only and mixed canonical restoration, exact outgoing checkpoints and schema/UI siblings, zero original handler reruns, Strict Mode and authoritative remounts, stale tokens, deferred completion inputs, reactive options and URL changes, fresh threads, and ordinary completion tool injection with its original arguments and AbortSignal.
- Full suites passed: 248 React tests in 22 files and 324 Angular tests in 25 files. Both package builds, lint targets and API reports passed. Actual new-spec TypeScript checks passed for both frameworks.
- Independent specification and code-quality reviews approved the resulting implementation without P1/P2 findings.

React lint retains ten existing warnings. Build tooling reports its existing Vite/Nx deprecations and color-environment warning. API Extractor creates the repository-ignored reports; its inline cross-package export comments follow the existing public-core-type reference pattern. The new recovery signatures reference public core types.

The isolated built-declaration consumer also passed with strict checking and `skipLibCheck: false`: twelve public result interfaces, exact non-`any` pending/command types, negative calls, and Angular completion's preserved explicit input/state generics. It copies built core/React/Angular declarations and the actual installed dependency declaration tree into a fresh directory, with no installation, source aliases or workspace symlinks. Internal with-message helpers remain unexported and receive the separate source-level checks. The first verifier correctly refused conflicting RxJS versions; the final verifier preserves both actual nested versions and records declaration hashes and resolved compiler inputs.
