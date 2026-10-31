import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEvidenceVerifier,
  verifyProducerSources,
  verifyProfileProvenance,
  producerSourcePaths,
} from './inventory-evidence.mjs';

import {
  additionalReferences,
  validateAdditionalQualification,
} from './additional-qualification.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const validatedInventories = new WeakMap();
const statuses = [
  'passed',
  'recipe-required',
  'missing-upstream',
  'unsupported',
  'not-tested',
  'deferred',
];
const stages = [
  'producer-execution',
  'bridge-wire',
  'core-consumer',
  'canonical-persistence',
  'next-request',
  'browser-react',
  'browser-angular',
  'native-recovery',
];
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const key = (profile) => `${profile.framework}/${profile.profile}`;
const unique = (items, label) =>
  assert.equal(new Set(items).size, items.length, `Duplicate ${label}`);

/**
 * Validate pure reviewed data and retained file contents without executing frameworks.
 * `evidence` maps repository-relative paths to `{ content, sha256 }` objects.
 * The legacy digest hashes UTF-8 `JSON.stringify(legacy)` (parsed insertion order).
 * Returns a detached plain JSON inventory; historical qualification is distinct from run health.
 */
export function validateInventory({
  catalog,
  qualification,
  legacy,
  evidence,
  additionalQualifications = [],
}) {
  assert.equal(catalog.schemaVersion, 1, 'Unsupported catalog schema');
  assert.equal(
    qualification.schemaVersion,
    1,
    'Unsupported qualification schema',
  );
  assert.equal(
    sha256(JSON.stringify(legacy)),
    qualification.legacySha256,
    'Legacy inventory changed',
  );
  unique(
    catalog.families.map((family) => family.id),
    'family IDs',
  );
  unique(
    catalog.scenarios.map((scenario) => scenario.id),
    'scenario IDs',
  );
  unique(
    [
      ...qualification.records,
      ...additionalQualifications,
      ...catalog.plannedProfiles,
    ].map((profile) => profile.id),
    'profile IDs',
  );
  unique(legacy.profiles.map(key), 'legacy profiles');
  const scenarios = new Map(
    catalog.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  for (const scenario of catalog.scenarios) {
    assert.ok(
      catalog.families.some((family) => family.id === scenario.family),
      `Unknown family ${scenario.family}`,
    );
    assert.ok(scenario.requiredStages.length, `Missing stages: ${scenario.id}`);
    unique(scenario.requiredStages, 'required stages');
    for (const stage of scenario.requiredStages)
      assert.ok(stages.includes(stage), `Unknown stage ${stage}`);
  }
  const verifyFile = createEvidenceVerifier(evidence);
  verifyProducerSources(qualification, evidence, verifyFile);
  for (const planned of catalog.plannedProfiles) {
    unique(planned.scenarioIds, 'planned scenario IDs');
    for (const id of planned.scenarioIds)
      assert.ok(scenarios.has(id), `Unknown planned scenario ${id}`);
    assert.equal(
      planned.status,
      'not-tested',
      `Planned profile ${planned.id} must remain not-tested`,
    );
    assert.ok(
      !planned.qualification && !planned.recipe,
      'Planned profile cannot claim qualification',
    );
    assert.ok(
      Object.values(planned.capabilities ?? {}).every(
        (status) => status === 'not-tested',
      ),
      'Planned capabilities must remain not-tested',
    );
  }
  assert.equal(
    qualification.records.length,
    legacy.profiles.length,
    'All legacy profiles require qualification records',
  );
  const profiles = qualification.records.map((record) => {
    const original = legacy.profiles.find(
      (profile) => key(profile) === key(record),
    );
    assert.ok(original, `Unknown legacy profile ${record.id}`);
    assert.equal(
      record.id,
      key(record),
      'Profile ID must preserve legacy identity',
    );
    verifyProfileProvenance(record, original, qualification, verifyFile);
    assert.ok(record.sources.length, 'Source evidence required');
    record.sources.forEach(verifyFile);
    unique(
      record.claims.map((claim) => claim.capability),
      'capability claims',
    );
    assert.deepEqual(
      record.claims.map((claim) => claim.capability).sort(),
      Object.keys(original.capabilities).sort(),
      'Legacy capability set changed',
    );
    for (const claim of record.claims) {
      assert.ok(
        statuses.includes(claim.status),
        `Unknown status ${claim.status}`,
      );
      assert.equal(
        claim.status,
        original.capabilities[claim.capability],
        'Legacy capability status changed',
      );
      const scenario = scenarios.get(claim.scenarioId);
      assert.ok(scenario, `Unknown scenario ${claim.scenarioId}`);
      assert.equal(
        scenario.capability,
        claim.capability,
        'Scenario capability mismatch',
      );
      unique(
        claim.evidence.map((item) => item.stage),
        'evidence stages',
      );
      for (const item of claim.evidence) {
        assert.ok(
          stages.includes(item.stage),
          `Unknown evidence stage ${item.stage}`,
        );
        assert.ok(
          ['pass', 'fail', 'infrastructure-error', 'not-run'].includes(
            item.result,
          ),
          'Unknown scenario result',
        );
        verifyFile(item);
        assert.ok(
          record.sources.some(
            (source) =>
              source.path === item.path && source.sha256 === item.sha256,
          ),
          'Stage source is not bound to qualification',
        );
      }
      if (claim.status === 'passed') {
        for (const stage of scenario.requiredStages)
          assert.ok(
            claim.evidence.some(
              (item) => item.stage === stage && item.result === 'pass',
            ),
            `Missing passed ${stage} evidence for ${claim.scenarioId}`,
          );
      }
    }
    return {
      ...original,
      id: record.id,
      status: 'legacy-qualified',
      qualification: record,
    };
  });
  const inventory = JSON.parse(
    JSON.stringify({
      schemaVersion: 1,
      catalog,
      profiles: [
        ...profiles,
        ...additionalQualifications.map((record) =>
          validateAdditionalQualification(record, scenarios, verifyFile),
        ),
        ...catalog.plannedProfiles.map((profile) => ({
          ...profile,
          capabilities: {},
          qualification: null,
        })),
      ],
      producerGaps: legacy.producerGaps,
      deferred: catalog.deferred,
      existingDotnetHost: legacy.existingDotnetHost,
      runHealth: qualification.runHealth ?? { status: 'not-run' },
    }),
  );
  validatedInventories.set(inventory, JSON.stringify(inventory));
  return inventory;
}

/**
 * Assert that an inventory came from this validator and has not changed since validation.
 * Authenticating the detached value lets pure renderers reuse the full evidence schema.
 * @param inventory - The exact value returned by validateInventory or loadInventory.
 */
export function assertValidatedInventory(inventory) {
  assert.ok(
    validatedInventories.has(inventory),
    'Expected a validated inventory',
  );
  assert.equal(
    JSON.stringify(inventory),
    validatedInventories.get(inventory),
    'Validated inventory changed',
  );
}

/**
 * Read reviewed JSON and local evidence files from a repository root.
 * Framework modules are never imported or installed. Defaults to this repository.
 */
export async function loadInventory(root = resolve(directory, '../../../..')) {
  const folder = resolve(root, 'tools/conformance/agent-frameworks/program');
  const [catalogText, qualificationText, legacyText] = await Promise.all([
    readFile(resolve(folder, 'catalog.json'), 'utf8'),
    readFile(resolve(folder, 'qualification.json'), 'utf8'),
    readFile(resolve(folder, '../capabilities.json'), 'utf8'),
  ]);
  const additionalText = await readFile(
    resolve(folder, 'pydantic-qualification.json'),
    'utf8',
  ).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const additional = additionalText
    ? JSON.parse(additionalText)
    : { schemaVersion: 1, records: [] };
  assert.equal(
    additional.schemaVersion,
    1,
    'Unsupported additional qualification schema',
  );
  assert.ok(
    Array.isArray(additional.records),
    'Additional qualification records required',
  );
  const additionalQualifications = additional.records;
  const catalog = JSON.parse(catalogText);
  const qualification = JSON.parse(qualificationText);
  const legacy = JSON.parse(legacyText);
  if (qualification.legacyFileSha256)
    assert.equal(
      sha256(legacyText),
      qualification.legacyFileSha256,
      'Legacy file bytes changed',
    );
  if (qualification.producerSources) {
    const expected = await producerSourcePaths(root);
    assert.deepEqual(
      qualification.producerSources.map((source) => source.path).sort(),
      expected,
      'Producer fingerprint must include exact original source inputs',
    );
  }
  const references = [
    ...additionalQualifications.flatMap(additionalReferences),
    ...(qualification.producerSources ?? []),
    ...qualification.records.flatMap((record) => [
      record.capture,
      ...record.sources,
      ...record.claims.flatMap((claim) => claim.evidence),
    ]),
  ];
  // Captures are inert JSON; discover retained raw wire and execution references only.
  for (const record of additionalQualifications) {
    const path = record.capture.path;
    assert.ok(
      !isAbsolute(path) && !path.split('/').includes('..'),
      'Evidence path escapes root',
    );
    const capture = JSON.parse(await readFile(resolve(root, path), 'utf8'));
    references.push(capture.wire, capture.executionSummary);
  }
  const evidence = Object.fromEntries(
    await Promise.all(
      [...new Set(references.map((reference) => reference.path))].map(
        async (path) => {
          const absolute = resolve(root, path);
          assert.ok(
            !isAbsolute(relative(root, absolute)) &&
              !relative(root, absolute).startsWith('..'),
            'Evidence path escapes root',
          );
          const content = await readFile(absolute, 'utf8');
          return [path, { content, sha256: sha256(content) }];
        },
      ),
    ),
  );
  return validateInventory({
    catalog,
    qualification,
    legacy,
    evidence,
    additionalQualifications,
  });
}
