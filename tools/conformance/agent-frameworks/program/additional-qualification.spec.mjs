import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { loadInventory, validateInventory } from './inventory.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const prefix = 'tools/conformance/agent-frameworks/python/';
const fixture = (options = {}) => {
  const evidence = {};
  const retain = (path, value) => {
    const content = typeof value === 'string' ? value : JSON.stringify(value);
    evidence[path] = { content, sha256: hash(content) };
    return { path, sha256: hash(content) };
  };
  const sourceInputs = [
    retain(prefix + 'host.py', '# actual host'),
    retain(prefix + 'controller.mjs', '// real controller'),
    retain(prefix + 'host_test.py', '# real assertion source'),
    retain(
      prefix + 'pyproject.toml',
      '[project]\ndependencies = ["pydantic-ai-slim==2.64.0"]\n',
    ),
    retain(prefix + '.python-version', '3.12.12\n'),
    retain(
      prefix + 'uv.lock',
      'version = 1\n[[package]]\nname = "pydantic-ai-slim"\nversion = "2.64.0"\n',
    ),
  ];
  sourceInputs.push(
    ...(options.consumerSources ?? []).map((path) =>
      retain(path, '// actual consumer assertion source'),
    ),
  );
  const sourceSha256 = hash(JSON.stringify(sourceInputs));
  const execution = { kind: 'local', id: 'qualification-2026-10-31' };
  const versions = { 'pydantic-ai-slim': '2.64.0' };
  const runtime = { python: '3.12.12', uv: '0.9.0' };
  const protocol = { requested: 'ag-ui', effective: 'ag-ui' };
  const events = options.events ?? [
    { type: 'RUN_STARTED', threadId: 'thread', runId: 'run' },
    {
      type: 'TOOL_CALL_START',
      toolCallId: 'server-call',
      toolCallName: 'serverTool',
    },
    { type: 'TOOL_CALL_END', toolCallId: 'server-call' },
    {
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'server-call',
      content: 'server-result:London',
    },
    { type: 'RUN_FINISHED', threadId: 'thread', runId: 'run' },
  ];
  const callbackObservationsRef = retain(
    prefix + 'evidence/server-tool.execution.json',
    options.callbackObservations ?? {
      entered: 1,
      completed: 1,
      failed: 0,
      cancelled: 0,
      requests: [{ threadId: 'thread', runId: 'run' }],
      history: [
        {
          parts: [
            {
              part_kind: 'tool-call',
              tool_call_id: 'server-call',
              tool_name: 'serverTool',
            },
            {
              part_kind: 'tool-return',
              tool_call_id: 'server-call',
              tool_name: 'serverTool',
              content: 'server-result:London',
            },
          ],
        },
      ],
    },
  );
  const stageNames = options.stageNames ?? [
    'producer-execution',
    'bridge-wire',
  ];
  const wire = retain(
    prefix + 'evidence/wire.sse',
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
  );
  const liveObservationsRef = options.liveObservations
    ? retain(
        prefix + 'evidence/server-tool.live.json',
        options.liveObservations,
      )
    : undefined;
  const executionSummary = retain(prefix + 'evidence/execution.json', {
    execution,
    sourceSha256,
    runtime,
    versions,
    realFrameworkExecution: true,
    ...(options.omitCallbackRef ? {} : { callbackObservationsRef }),
    ...(liveObservationsRef ? { liveObservationsRef } : {}),
    wire,
  });
  const capture = retain(prefix + 'evidence/capture.json', {
    framework: 'pydantic-ai',
    profile: 'native-http',
    versions,
    runtime,
    platform: 'darwin-arm64',
    protocol,
    transport: 'http-sse',
    execution,
    sourceInputs,
    sourceSha256,
    wire,
    executionSummary,
    events,
    eventsSha256: hash(JSON.stringify(events)),
  });
  const stage = retain(prefix + 'evidence/stages.json', {
    profileId: 'pydantic-ai/native-http',
    execution,
    sourceSha256,
    captureSha256: capture.sha256,
    observations: [
      ...stageNames.map((stage) => ({
        scenarioId: 'tools.execution',
        stage,
        result: 'pass',
      })),
      ...(options.extraObservations ?? []),
    ],
  });
  const record = {
    id: 'pydantic-ai/native-http',
    framework: 'pydantic-ai',
    profile: 'native-http',
    mode: 'native',
    qualifiedAt: '2026-10-31',
    sourceCommit: 'a'.repeat(40),
    versions,
    runtime,
    platform: 'darwin-arm64',
    protocol,
    transport: 'http-sse',
    execution,
    sourceInputs,
    capture: { ...capture, sourceSha256 },
    sources: [
      wire,
      executionSummary,
      stage,
      ...sourceInputs,
      callbackObservationsRef,
      ...(liveObservationsRef ? [liveObservationsRef] : []),
    ],
    claims: [
      {
        scenarioId: 'tools.execution',
        capability: 'actualServerToolExecution',
        status: 'passed',
        evidence: stageNames.map((stageName) => ({
          ...stage,
          stage: stageName,
          result: 'pass',
        })),
      },
    ],
  };
  const legacy = {
    profiles: [],
    producerGaps: [],
    existingDotnetHost: { status: 'not-tested' },
  };
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
      plannedProfiles: [],
      deferred: [],
    },
    qualification: {
      schemaVersion: 1,
      legacySha256: hash(JSON.stringify(legacy)),
      records: [],
    },
    legacy,
    evidence,
    additionalQualifications: [record],
  };
};
const rewrite = (input, reference, change) => {
  const value = JSON.parse(input.evidence[reference.path].content);
  change(value);
  const content = JSON.stringify(value);
  input.evidence[reference.path] = { content, sha256: hash(content) };
  reference.sha256 = hash(content);
};

test('adds a local qualification without CI fabrication or mutating input', () => {
  const input = fixture();
  const before = JSON.stringify(input);

  const result = validateInventory(input);

  assert.equal(result.profiles.length, 1);
  assert.equal(
    result.profiles[0].capabilities.actualServerToolExecution,
    'passed',
  );
  assert.equal(result.profiles[0].qualification.execution.kind, 'local');
  assert.equal(result.profiles[0].qualification.ciRun, undefined);
  assert.equal(JSON.stringify(input), before);
});

const invalid = [
  ['missing required stage', (x, r) => r.claims[0].evidence.pop()],
  [
    'altered wire bytes',
    (x, r) => {
      x.evidence[r.sources[0].path].content += ' ';
    },
  ],
  [
    'missing local identity',
    (x, r) => {
      delete r.execution.id;
    },
  ],
  [
    'fabricated local CI',
    (x, r) => {
      r.ciRun = '123';
    },
  ],
  [
    'runtime mismatch',
    (x, r) => {
      r.runtime.python = '3.13.0';
    },
  ],
  [
    'missing lock',
    (x, r) => {
      r.sourceInputs = r.sourceInputs.filter(
        (s) => !s.path.endsWith('uv.lock'),
      );
    },
  ],
  [
    'native recipe conflation',
    (x, r) => {
      r.recipe = { id: 'invented', version: '1.0.0' };
    },
  ],
  [
    'unknown status',
    (x, r) => {
      r.claims[0].status = 'green';
    },
  ],
  [
    'duplicate profile',
    (x, r) => {
      x.additionalQualifications.push(structuredClone(r));
    },
  ],
  [
    'invented stage result',
    (x, r) => {
      r.claims[0].evidence[0].result = 'fail';
    },
  ],
  [
    'unbound events',
    (x, r) => {
      rewrite(x, r.capture, (c) => {
        c.events = [];
        c.eventsSha256 = hash('[]');
      });
    },
  ],
  [
    'invented execution',
    (x, r) => {
      rewrite(x, r.capture, (c) => {
        c.execution.id = 'different';
      });
    },
  ],
  [
    'invented stage observation',
    (x, r) => {
      rewrite(x, r.claims[0].evidence[0], (s) => {
        s.observations[0].result = 'fail';
      });
      r.sources[2].sha256 = r.claims[0].evidence[0].sha256;
      r.claims[0].evidence[1].sha256 = r.claims[0].evidence[0].sha256;
    },
  ],
  [
    'native recovery promotion',
    (x, r) => {
      x.catalog.scenarios[0].requiredStages.push('native-recovery');
      r.claims[0].evidence.push({
        ...r.claims[0].evidence[0],
        stage: 'native-recovery',
      });
    },
  ],
];
for (const [name, change] of invalid) {
  test(`rejects additional qualification with ${name}`, () => {
    const input = fixture();
    change(input, input.additionalQualifications[0]);

    const act = () => validateInventory(input);

    assert.throws(act);
  });
}

test('loads optional additional records and their nested retained evidence as data only', async () => {
  const input = fixture();
  const root = await mkdtemp(join(tmpdir(), 'additional-inventory-'));
  const folder = 'tools/conformance/agent-frameworks/program/';
  const files = {
    [folder + 'catalog.json']: JSON.stringify(input.catalog),
    [folder + 'qualification.json']: JSON.stringify(input.qualification),
    [folder + 'pydantic-qualification.json']: JSON.stringify({
      schemaVersion: 1,
      records: input.additionalQualifications,
    }),
    [folder + '../capabilities.json']: JSON.stringify(input.legacy),
    ...Object.fromEntries(
      Object.entries(input.evidence).map(([path, file]) => [
        path,
        file.content,
      ]),
    ),
  };
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }

    const result = await loadInventory(root);

    assert.equal(result.profiles[0].id, 'pydantic-ai/native-http');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a passed claim containing an observed failing stage', () => {
  const input = fixture();
  const record = input.additionalQualifications[0];
  const stageReference = record.sources.find((source) =>
    source.path.endsWith('stages.json'),
  );
  rewrite(input, stageReference, (value) =>
    value.observations.push({
      scenarioId: 'tools.execution',
      stage: 'core-consumer',
      result: 'fail',
    }),
  );
  record.claims[0].evidence = record.claims[0].evidence.map((item) => ({
    ...item,
    sha256: stageReference.sha256,
  }));
  record.claims[0].evidence.push({
    ...stageReference,
    stage: 'core-consumer',
    result: 'fail',
  });

  const act = () => validateInventory(input);

  assert.throws(act, /passed claim|Passed claim/i);
});

test('rejects a claimed producer gap without an executed probe', () => {
  const input = fixture();
  input.additionalQualifications[0].claims[0].status = 'missing-upstream';
  input.additionalQualifications[0].claims[0].evidence = [];

  const act = () => validateInventory(input);

  assert.throws(act, /probe|evidence/i);
});

for (const [name, options] of [
  [
    'run envelopes without any tool events',
    {
      events: [
        { type: 'RUN_STARTED', threadId: 'thread', runId: 'run' },
        { type: 'RUN_FINISHED', threadId: 'thread', runId: 'run' },
      ],
    },
  ],
  ['missing callback reference', { omitCallbackRef: true }],
  [
    'invented callback marker',
    { callbackObservations: { realFrameworkExecution: true } },
  ],
  [
    'uncompleted callback',
    {
      callbackObservations: {
        entered: 1,
        completed: 0,
        failed: 0,
        cancelled: 0,
      },
    },
  ],
  [
    'conflicting observation omitted from claim',
    {
      extraObservations: [
        { scenarioId: 'tools.execution', stage: 'bridge-wire', result: 'fail' },
      ],
    },
  ],
  [
    'duplicate passing observation',
    {
      extraObservations: [
        { scenarioId: 'tools.execution', stage: 'bridge-wire', result: 'pass' },
      ],
    },
  ],
  [
    'unreferenced failing observation',
    {
      extraObservations: [
        {
          scenarioId: 'tools.execution',
          stage: 'core-consumer',
          result: 'fail',
        },
      ],
    },
  ],
  [
    'missing prepared-store assertion source',
    { stageNames: ['producer-execution', 'bridge-wire', 'core-consumer'] },
  ],
  [
    'missing browser assertion sources',
    { stageNames: ['producer-execution', 'bridge-wire', 'browser-react'] },
  ],
  [
    'missing dedicated browser config',
    {
      stageNames: ['producer-execution', 'bridge-wire', 'browser-angular'],
      consumerSources: ['tools/conformance/pydantic-ai/pydantic-ai.spec.ts'],
    },
  ],
]) {
  test(`rejects a passed claim with ${name}`, () => {
    const input = fixture(options);

    const act = () => validateInventory(input);

    assert.throws(act);
  });
}

test('requires causal observations for a live-start claim', () => {
  const input = fixture();
  input.catalog.scenarios[0].capability = 'liveStartBeforeToolCompletion';
  input.additionalQualifications[0].claims[0].capability =
    'liveStartBeforeToolCompletion';

  const act = () => validateInventory(input);

  assert.throws(act, /live|causal/i);
});

test('accepts bound callback execution, causal live start and exact consumer assertion sources', () => {
  const input = fixture({
    stageNames: [
      'producer-execution',
      'bridge-wire',
      'core-consumer',
      'browser-react',
      'browser-angular',
    ],
    consumerSources: [
      'packages/core/src/models/pydantic-ai.conformance.spec.ts',
      'tools/conformance/pydantic-ai/pydantic-ai.spec.ts',
      'tools/conformance/pydantic-ai.playwright.config.ts',
    ],
    liveObservations: { toolStartSeen: true, completedBeforeRelease: 0 },
  });
  input.catalog.scenarios[0].capability = 'liveStartBeforeToolCompletion';
  input.additionalQualifications[0].claims[0].capability =
    'liveStartBeforeToolCompletion';

  const result = validateInventory(input);

  assert.equal(
    result.profiles[0].capabilities.liveStartBeforeToolCompletion,
    'passed',
  );
});

test('rejects a non-immutable evidence commit', () => {
  const input = fixture();
  input.additionalQualifications[0].evidenceCommit = 'main';

  const act = () => validateInventory(input);

  assert.throws(act, /evidence commit/i);
});

test('allows separately committed retained evidence without changing execution commit', () => {
  const input = fixture();
  input.additionalQualifications[0].evidenceCommit = 'b'.repeat(40);

  const result = validateInventory(input);

  assert.equal(result.profiles[0].qualification.sourceCommit, 'a'.repeat(40));
  assert.equal(result.profiles[0].qualification.evidenceCommit, 'b'.repeat(40));
});

test('requires consumer assertion sources for passed probe stages on a producer gap', () => {
  const input = fixture({
    stageNames: ['producer-execution', 'bridge-wire', 'core-consumer'],
  });
  input.additionalQualifications[0].claims[0].status = 'missing-upstream';

  const act = () => validateInventory(input);

  assert.throws(act, /consumer assertion source/);
});
