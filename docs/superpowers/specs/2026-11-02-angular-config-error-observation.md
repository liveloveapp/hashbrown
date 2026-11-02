# Observe actual Angular config errors after scheduler cleanup

Status: independently reviewed fixture correction; the focused actual browser journey passed all eight React/Angular provider/API compositions, including retained actual error/no-work/view evidence. Full matrix and integration remain pending. Attempt18 case204 remains retained integration RED.

## Evidence and cause

The negative config action changes the real Angular system signal while an actual browser recovery batch is pending. The public resource options effect calls the SDK updateOptions guard; no fixture precheck or synthetic rejection is needed. The existing custom ErrorHandler captures the actual routed exception and its explicit config-action epoch.

Pinned Angular's zoneless scheduler invokes the application error handler inside its failed tick catch, before finally clears runningTick and the pending render task. Its shouldScheduleTick rejects new notifications while either is active. Synchronously setting the fixture error signal there marks the view dirty but does not arrange another tick. This explains the retained stale DOM, absent config-error element and lack of uncaught page/console error; it does not establish a failed SDK authority guard.

## Narrow correction

CandidateFrameworkErrors synchronously derives the escaped failure record from the actual exception and current explicit action epoch, then finishes that exact epoch. It queues only failure.set(record) in a microtask. JavaScript runs that microtask after the synchronous scheduler catch/finally returns, so the genuine display signal notification can schedule a fresh zoneless render.

Classification, original error text/stack and epoch are captured before the deferral. No error is manufactured, no exception is suppressed by a new SDK catch, and no system configuration is reverted or retried. Unrelated exceptions retain runtime-error classification. The app continues rendering the escaped record outside the affected leaf.

## Verification and bounds

The existing actual browser mutation journey must observe the genuine config-error record only after its explicit action, retain zero additional provider/native/browser effects, retire the failed view and perform a genuine read in a new original-config view before settlement. Preserve all372 manifest keys and existing replay/single-use guards. Parent runs source review, focused browser/fixture checks, type/lint and fresh candidate qualification. No new dependency, public API or SDK/Core behavior change.

Retain the actual DOM error record, including epoch and stack, together with independently captured native/provider/observer before/after snapshots and public configuration/pending views before assertions or remount. The no-work assertion remains exact; retained public configuration and pending batch must also remain equal. This packet is evidence from the real SDK error, never a synthesized expected failure.

React's existing error boundary retires the failed subtree and exposes only the genuine exception. Record the actual remaining status-element count and require zero for React; do not attempt to read or reconstruct an unavailable public view. Angular retains the mounted resource: require one status element and compare its actual configuration and pending batch. Select this contract by the known framework, never by a timeout fallback. Both frameworks retain the same actual error and independent native/provider/observer no-work comparisons, then reopen and read before settlement. The earlier unconditional post-error status read failed in attempt19; it remains failed evidence. Verify all eight framework/provider/API combinations before a fresh full matrix.
