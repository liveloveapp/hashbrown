import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadInventory, validateInventory } from './inventory.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const encode = (value) => JSON.stringify(value);
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const fixture = () => {
  const capture = {
    framework: 'example',
    profile: 'native',
    versions: { sdk: '1.0.0' },
    events: [],
    evidence: { realFrameworkExecution: true },
    provenance: { sourceSha256: 'a'.repeat(64), eventsSha256: hash('[]') },
  };
  const source = 'real source';
  const legacy = {
    profiles: [
      {
        framework: 'example',
        profile: 'native',
        fixture: 'capture.json',
        versions: { sdk: '1.0.0' },
        capabilities: { actualServerToolExecution: 'passed' },
      },
    ],
    producerGaps: [],
    deferred: ['file-search'],
    existingDotnetHost: { status: 'not-tested' },
  };
  const reference = { path: 'source.mjs', sha256: hash(source) };
  return {
    catalog: {
      schemaVersion: 1,
      families: [{ id: 'tools' }],
      scenarios: [
        {
          id: 'tools.execution',
          family: 'tools',
          capability: 'actualServerToolExecution',
          requiredStages: ['producer-execution', 'bridge-wire'],
        },
      ],
      plannedProfiles: [
        {
          id: 'pydantic',
          framework: 'pydantic-ai',
          profile: 'planned',
          status: 'not-tested',
          scenarioIds: ['tools.execution'],
        },
      ],
      deferred: ['file-search'],
    },
    legacy,
    qualification: {
      schemaVersion: 1,
      legacySha256: hash(encode(legacy)),
      records: [
        {
          id: 'example/native',
          framework: 'example',
          profile: 'native',
          mode: 'native',
          qualifiedAt: '2026-10-30',
          sourceCommit: '826953718d22af984606c51645cb18e6acd3655b',
          sourcePullRequest: 844,
          ciRun: '41100895094',
          ciUrl:
            'https://github.com/liveloveapp/hashbrown/actions/runs/41100895094',
          runtime: 'not-recorded',
          protocol: 'not-recorded',
          versions: { sdk: '1.0.0' },
          capture: {
            path: 'capture.json',
            sha256: hash(encode(capture)),
            sourceSha256: capture.provenance.sourceSha256,
          },
          sources: [reference],
          claims: [
            {
              capability: 'actualServerToolExecution',
              scenarioId: 'tools.execution',
              status: 'passed',
              evidence: ['producer-execution', 'bridge-wire'].map((stage) => ({
                ...reference,
                stage,
                result: 'pass',
              })),
            },
          ],
        },
      ],
    },
    evidence: {
      'capture.json': {
        content: encode(capture),
        sha256: hash(encode(capture)),
      },
      'source.mjs': { content: source, sha256: hash(source) },
    },
  };
};

test('validates a minimal qualified record without mutating frozen input', () => {
  const input = freeze(fixture());
  const before = encode(input);

  const result = validateInventory(input);

  assert.equal(
    result.profiles[0].capabilities.actualServerToolExecution,
    'passed',
  );
  assert.equal(encode(input), before);
});

const invalid = [
  [
    'unknown planned scenario',
    (x) => {
      x.catalog.plannedProfiles[0].scenarioIds = ['unknown'];
    },
  ],
  [
    'malformed source commit',
    (x) => {
      x.qualification.records[0].sourceCommit = 'main';
    },
  ],
  [
    'invalid qualification date',
    (x) => {
      x.qualification.records[0].qualifiedAt = '2026-02-30';
    },
  ],
  [
    'malformed CI run ID',
    (x) => {
      x.qualification.records[0].ciRun = 'latest';
    },
  ],
  [
    'mismatched CI run URL',
    (x) => {
      x.qualification.records[0].ciUrl =
        'https://github.com/liveloveapp/hashbrown/actions/runs/12';
    },
  ],
  [
    'legacy native profile relabeled recipe',
    (x) => {
      x.qualification.records[0].mode = 'recipe';
      x.qualification.records[0].recipe = { id: 'invented', version: '1.0.0' };
    },
  ],

  [
    'planned passed promotion',
    (x) => {
      x.catalog.plannedProfiles[0].status = 'passed';
    },
  ],
  [
    'planned capability passed promotion',
    (x) => {
      x.catalog.plannedProfiles[0].capabilities = { subagents: 'passed' };
    },
  ],
  [
    'capture metadata mismatch',
    (x) => {
      x.qualification.records[0].capture.metadata = { invented: true };
    },
  ],
  [
    'missing required evidence',
    (x) => {
      x.qualification.records[0].claims[0].evidence.pop();
    },
  ],
  [
    'tampered capture',
    (x) => {
      x.evidence['capture.json'].content += ' ';
    },
  ],
  [
    'version mismatch',
    (x) => {
      x.qualification.records[0].versions.sdk = '2.0.0';
    },
  ],
  [
    'source hash mismatch',
    (x) => {
      x.qualification.records[0].sources[0].sha256 = 'b'.repeat(64);
    },
  ],
  [
    'missing source file',
    (x) => {
      delete x.evidence['source.mjs'];
    },
  ],
  [
    'duplicate profile ID',
    (x) => {
      x.qualification.records.push(structuredClone(x.qualification.records[0]));
    },
  ],
  [
    'duplicate scenario ID',
    (x) => {
      x.catalog.scenarios.push(structuredClone(x.catalog.scenarios[0]));
    },
  ],
  [
    'unknown capability status',
    (x) => {
      x.qualification.records[0].claims[0].status = 'green';
    },
  ],
  [
    'unknown scenario',
    (x) => {
      x.qualification.records[0].claims[0].scenarioId = 'unknown';
    },
  ],
  [
    'native recipe conflation',
    (x) => {
      x.qualification.records[0].recipe = { id: 'invented' };
    },
  ],
  [
    'canonical restore cannot prove durable restart',
    (x) => {
      x.catalog.scenarios[0].requiredStages.push('native-recovery');
    },
  ],
  [
    'rewritten legacy state',
    (x) => {
      x.legacy.profiles[0].capabilities.actualServerToolExecution =
        'not-tested';
    },
  ],
  [
    'rewritten legacy gap',
    (x) => {
      x.legacy.producerGaps.push({ status: 'passed' });
    },
  ],
  [
    'missing claim for existing capability',
    (x) => {
      x.qualification.records[0].claims = [];
    },
  ],
  [
    'failed stage cannot qualify',
    (x) => {
      x.qualification.records[0].claims[0].evidence[0].result = 'fail';
    },
  ],
];
for (const [name, change] of invalid) {
  test(`rejects ${name}`, () => {
    const input = fixture();
    change(input);

    const validate = () => validateInventory(input);

    assert.throws(validate);
  });
}

test('loads seven exact legacy profiles, six gaps and untested planned coverage', async () => {
  const result = await loadInventory();

  assert.equal(
    result.profiles.filter((x) => x.status === 'legacy-qualified').length,
    7,
  );
  assert.equal(result.producerGaps.length, 6);
  assert.equal(result.catalog.families.length, 10);
  assert.equal(result.catalog.plannedProfiles[0].framework, 'pydantic-ai');
  assert.ok(
    result.catalog.plannedProfiles.every((x) => x.status === 'not-tested'),
  );
  assert.ok(result.deferred.includes('file-search'));
  assert.equal(result.existingDotnetHost.status, 'not-tested');
});

test('loadInventory reports a missing local evidence file with explicit cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hashbrown-program-inventory-'));
  const input = fixture();
  const directory = join(root, 'tools/conformance/agent-frameworks/program');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'catalog.json'), encode(input.catalog));
  await writeFile(
    join(directory, 'qualification.json'),
    encode(input.qualification),
  );
  await writeFile(
    join(directory, '../capabilities.json'),
    encode(input.legacy),
  );

  try {
    await assert.rejects(loadInventory(root), /capture.json|source.mjs/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('migration preserves native child and unqualified recipe gap independently', async () => {
  const inventory = await loadInventory();

  const nativeChild = inventory.profiles.find(
    (profile) => profile.id === 'langgraph/native-subgraph',
  );
  const progressGap = inventory.producerGaps.find(
    (gap) => gap.capability === 'native-activities',
  );

  assert.equal(nativeChild.capabilities.nativeChildExecution, 'passed');
  assert.equal(nativeChild.capabilities.subagents, 'missing-upstream');
  assert.equal(progressGap.status, 'recipe-required');
  assert.ok(
    inventory.profiles
      .filter((profile) => profile.id.startsWith('langgraph/'))
      .every((profile) => !profile.qualification?.recipe),
  );
});

test('rejects omitted or duplicated producer fingerprint inputs', async () => {
  const { readFile } = await import('node:fs/promises');
  const root = new URL('./', import.meta.url);
  const catalog = JSON.parse(
    await readFile(new URL('catalog.json', root), 'utf8'),
  );
  const qualification = JSON.parse(
    await readFile(new URL('qualification.json', root), 'utf8'),
  );
  const legacy = JSON.parse(
    await readFile(new URL('../capabilities.json', root), 'utf8'),
  );
  const references = [
    ...qualification.producerSources,
    ...qualification.records.flatMap((record) => [
      record.capture,
      ...record.sources,
    ]),
  ];
  const repo = new URL('../../../../', root);
  const evidence = Object.fromEntries(
    await Promise.all(
      references.map(async ({ path }) => {
        const content = await readFile(new URL(path, repo), 'utf8');
        return [path, { content, sha256: hash(content) }];
      }),
    ),
  );
  const omitted = structuredClone(qualification);
  omitted.producerSources.pop();
  const duplicate = structuredClone(qualification);
  duplicate.producerSources.push(duplicate.producerSources[0]);

  const validateOmitted = () =>
    validateInventory({ catalog, qualification: omitted, legacy, evidence });
  const validateDuplicate = () =>
    validateInventory({ catalog, qualification: duplicate, legacy, evidence });

  assert.throws(validateOmitted);
  assert.throws(validateDuplicate);
});

test('catalog keeps recovery levels separate and preserves legacy unqualified scenarios', async () => {
  const inventory = await loadInventory();
  const expected = [
    'recovery.browser-reload',
    'recovery.reconnect',
    'tools.client-roundtrip',
    'tools.failure',
    'tools.cancel',
    'conversation.abnormal-eof',
  ];
  const pydantic = inventory.catalog.plannedProfiles[0];

  const scenarios = inventory.catalog.scenarios.map((scenario) => scenario.id);
  const qualified = inventory.profiles
    .filter((profile) => profile.status === 'legacy-qualified')
    .flatMap((profile) => profile.qualification?.claims ?? []);

  for (const id of expected) {
    assert.ok(scenarios.includes(id), `Missing separate scenario ${id}`);
    assert.ok(pydantic.scenarioIds.includes(id));
    assert.ok(
      !qualified.some(
        (claim) => claim.scenarioId === id && claim.status === 'passed',
      ),
    );
  }
});
