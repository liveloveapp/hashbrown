import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, readPhysical } from './files.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const upgraded = ['client', 'core', 'encoder', 'proto'].map(
  (name) => `node_modules/@ag-ui/${name}`,
);
const removed = ['client', 'proto'].map(
  (name) => `node_modules/@ag-ui/${name}/node_modules/zod`,
);

/**
 * Derives the reviewed candidate graph without changing historical evidence.
 *
 * @param historicalBytes - Exact bytes of the retained published lock.
 * @param policy - Hash-anchored AG-UI security patch retained with the source.
 * @returns A separate candidate graph with all other package records preserved.
 */
export function applyCandidateDependencyPatch(historicalBytes, policy) {
  assert.equal(policy.schema, 1, 'Candidate dependency policy schema differs');
  assert.equal(
    digest(historicalBytes),
    policy.historicalLockSha256,
    'Historical dependency lock hash differs',
  );
  assert.deepEqual(
    Object.keys(policy.replacements).sort(),
    [...upgraded].sort(),
    'Candidate dependency replacement inventory differs',
  );
  assert.deepEqual(
    Object.keys(policy.removals).sort(),
    [...removed].sort(),
    'Candidate dependency removal inventory differs',
  );
  const lock = JSON.parse(historicalBytes);
  for (const location of upgraded) {
    const change = policy.replacements[location];
    assert.equal(
      digest(JSON.stringify(lock.packages[location])),
      change.previousSha256,
      `Historical dependency record differs: ${location}`,
    );
    assert.equal(change.record.version, '1.0.4', 'Reviewed AG-UI pin required');
    lock.packages[location] = structuredClone(change.record);
  }
  for (const location of removed) {
    assert.equal(
      digest(JSON.stringify(lock.packages[location])),
      policy.removals[location],
      `Historical removed dependency differs: ${location}`,
    );
    delete lock.packages[location];
  }
  const core = lock.packages['node_modules/@hashbrownai/core'];
  for (const name of ['@ag-ui/client', '@ag-ui/core']) {
    assert.equal(
      core.dependencies[name],
      '1.0.3',
      'Historical SDK pin differs',
    );
    core.dependencies[name] = '1.0.4';
  }
  return lock;
}

/**
 * Reads historical evidence and independently derives its candidate-only graph.
 *
 * @returns Both graph identities; historical archive metadata remains separate.
 */
export async function readCandidateDependencyBaseline() {
  const [manifestBytes, historicalBytes, policyBytes] = await Promise.all([
    readPhysical(path.join(here, '../live-consumer/package.json')),
    readPhysical(path.join(here, '../live-consumer/package-lock.json')),
    readPhysical(path.join(here, 'dependency-patch.json')),
  ]);
  const lock = applyCandidateDependencyPatch(
    historicalBytes,
    JSON.parse(policyBytes),
  );
  return {
    manifest: JSON.parse(manifestBytes),
    historicalLock: JSON.parse(historicalBytes),
    lock,
    identity: {
      historicalLockSha256: digest(historicalBytes),
      policySha256: digest(policyBytes),
      candidateGraphSha256: digest(JSON.stringify(lock)),
    },
  };
}
