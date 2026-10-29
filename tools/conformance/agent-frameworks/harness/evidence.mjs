import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { semanticProjection } from './capture.mjs';

/** Hash the exact JSON representation saved in the raw event corpus. */
export function eventsSha256(events) {
  return createHash('sha256').update(JSON.stringify(events)).digest('hex');
}

/** Snapshot JSON wire output with its source fingerprint and raw-event integrity hash. */
export function createCapture(record, sourceSha256) {
  return {
    ...JSON.parse(JSON.stringify(record)),
    provenance: { sourceSha256, eventsSha256: eventsSha256(record.events) },
  };
}

/** Verify saved integrity and compare a fresh real run without erasing identity relationships. */
export function verifyCapture(saved, current) {
  assert.equal(
    saved.provenance.eventsSha256,
    eventsSha256(saved.events),
    'Saved event hash mismatch',
  );
  assert.equal(
    current.provenance.eventsSha256,
    eventsSha256(current.events),
    'Current event hash mismatch',
  );
  const project = ({ events, provenance, ...record }) => ({
    ...record,
    sourceSha256: provenance.sourceSha256,
    events: semanticProjection(events),
  });
  assert.deepEqual(project(saved), project(current));
}
