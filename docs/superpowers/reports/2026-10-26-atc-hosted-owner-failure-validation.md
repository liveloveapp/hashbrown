# ATC hosted owner-failure and lease-fencing validation

Date: 2026-10-26. B4 packages: published 0.15.5.

Sanitized results: [2026-10-26-atc-hosted-owner-failure-validation-evidence.json](./2026-10-26-atc-hosted-owner-failure-validation-evidence.json).

## Scope and topology

Validation used a dedicated hosted ATC preview Postgres database and fresh synthetic threads. Storage probes used owned local Node workers running the published Postgres storage APIs. Runtime probes used the actual generated ATC server artifact, with an independent managed Vercel preview as successor. Signals targeted only owned local children. These results do not demonstrate termination or suspension of a managed Vercel worker.

Generated artifact source: `9f9f196c0eae38745f50af3b549621fb96c24cff`. Managed successor: `dpl_8MyGopGhvVgWAGofb24bD4vRacTu`.

## Hosted storage results

All five cases passed:

1. Heartbeat renewal preserved ownership beyond the original expiry; a competitor was denied until release.
2. Killing an owned worker without cleanup left its lease intact. Admission remained denied before expiry and succeeded after natural expiry.
3. Suspending an owner through expiry allowed a successor. On resume, the stale write failed and aborted the old owner; stale release did not remove the successor lease.
4. Expiring only a synthetic admission row while its owner signal was still active demonstrated database fencing independently of heartbeat cancellation. The stale write failed and aborted the signal; stale release preserved the successor.
5. A fenced transaction held the admission row through expiry. A real database lock blocker was observed. Its late COMMIT failed admission validation, rolled back the effect, and allowed the waiting successor to acquire.

The storage probes used a six-second lease and one-second heartbeat except the late-COMMIT case (four-second heartbeat) and the explicit database-fence case (long lease/heartbeat to keep its signal active until the attempted write). They do not establish production lease timing.

## Generated runtime owner death

A successful seed first established committed human and provider history. An owned process running the generated ATC server then began a follow-up and was killed without cleanup. The managed preview returned a 409 with Retry-After before the default 30-second lease expired, then completed a successor dispatched after database-clock expiry.

The successor preserved the committed seed and appended the latest follow-up exactly once. Its output matched the pinned schema, and persisted provider metadata reported a 4096-token cap; the lease was released. Immediate and 75-second snapshots matched for checkpoint ID, human content hashes, provider IDs, and zero leases. These snapshots are not continuous monitoring.

An initial harness assumption expected uncommitted browser history to be restored. The handler accepts the newest user input and restores committed history from its checkpoint, so that expectation was incorrect. The final probe seeded committed history first and verified its preservation. The killed owner’s in-flight input had not committed and was absent from the successor checkpoint; only the committed seed and newest successor input were retained. This was a probe correction, not a product defect.

## Suspended runtime

An owned generated-runtime process committed its input and began a real Responses API request through a private loopback proxy. The proxy checked authentication, exact pinned schema constraints (including any matching root dialect), strict structured-output format, streaming, and the 4096-token request cap. It held actual upstream response bytes; no model output was fabricated.

The owner was suspended with SIGSTOP after its input checkpoint committed and the admission row was unlocked. An independent managed successor received a 409 wholly before database-clock lease expiry, then completed when dispatched after natural expiry. The successor retained the committed seed and suspended-owner input and appended the latest follow-up.

The proxy delivered the real completed provider response after the successor settled, then the parent resumed the old process. The old process consumed the completed provider bytes and emitted admission aborts classified as database lease expiry/replacement. Its terminal outcome was recognized as ownership cancellation/fencing. The canonical checkpoint and provider IDs matched the successor snapshot and excluded the old provider ID; no lease remained. Immediate and 75-second snapshots matched for the complete recorded checkpoint summary and zero leases.

This demonstrates database-fence validation after actual completed-provider-byte consumption, rather than heartbeat cancellation before response consumption. The generic admission observer cannot identify whether the rejected operation was a checkpoint, status, or cleanup write; an attempted stale checkpoint commit is not proven. The old stream did emit text before the terminal ownership outcome, so durable-state fencing is not a guarantee that a still-attached old stream emits no bytes.

The first suspended-probe attempt stopped before suspension because the harness incorrectly assumed the SDK removed the root schema dialect. The successful request diagnostics confirmed Responses with a matching dialect and identical schema constraints. This was a harness correction.

## Limits and follow-ups

- Exercise managed-host worker termination or database failover separately; this probe controlled local owners over hosted storage.
- Extend accepted browser-tool callback cancellation and conflicting callback payload interleavings.
- Complete sustained load validation before selecting B4 for production.

Production backend selection and package publication were not changed by these probes. Evidence contains hashes rather than admission owner tokens or credentials. Synthetic audit rows were retained; cleanup targets only owned worker processes, proxy sockets, and temporary credentials. The pulled preview credential file was deleted after the final experiment and its absence verified.
