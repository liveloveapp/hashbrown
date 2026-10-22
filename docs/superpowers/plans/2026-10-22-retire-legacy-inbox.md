# Retire legacy receiving alias

The operator requested root-only receiving and forwarding. Preserve the historical mailbox ledger identity and immutable start/checkpoint; no database migration or history rewrite is needed. Production preflight found zero received, pending or unforwarded receipts.

- Write failing tests rejecting legacy admission, processing, forwarding and recovery; root receiving must continue to work.
- Restrict the shared recipient predicate to Brian’s root address. Update active fixtures and root-only provisioning so setup cannot recreate the retired alias.
- Document root-only operation. Build/test/lint growth, lifecycle and www; run the dedicated database suite and review the changes.
- Commit, open a PR and merge after required checks, then verify the production deployment.
- Delete only the unused Resend receiving subdomain and its exact DNS records after preserving a configuration snapshot. Root MX and sending records stay intact. Verify root receiving, signed legacy rejection and recovery health. Preserve live server credentials and historical SQL migrations.
