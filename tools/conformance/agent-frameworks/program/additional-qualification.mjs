import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const hash = (content) => createHash('sha256').update(content).digest('hex');
const unique = (items, name) =>
  assert.equal(new Set(items).size, items.length, `Duplicate ${name}`);
const exactVersion = (value) =>
  assert.match(
    value,
    /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/,
    'Exact version required',
  );
const statuses = [
  'passed',
  'recipe-required',
  'missing-upstream',
  'unsupported',
  'not-tested',
  'deferred',
];
const results = ['pass', 'fail', 'infrastructure-error', 'not-run'];
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
const prefix = 'tools/conformance/agent-frameworks/python/';

/** Bind a successful server callback's native history to the retained wire events. */
function verifyServerCallback(summary, events, bound) {
  assert.ok(
    summary.callbackObservationsRef,
    'Raw callback observations reference required',
  );
  const callback = JSON.parse(bound(summary.callbackObservationsRef));
  for (const [name, value] of Object.entries({
    entered: 1,
    completed: 1,
    failed: 0,
    cancelled: 0,
  }))
    assert.equal(callback[name], value, `Actual callback ${name} mismatch`);
  const starts = events.filter((event) => event.type === 'TOOL_CALL_START');
  assert.equal(starts.length, 1, 'One actual server tool start required');
  const start = starts[0];
  assert.ok(
    start.toolCallId && start.toolCallName,
    'Server tool identity required',
  );
  const ends = events.filter(
    (event) =>
      event.type === 'TOOL_CALL_END' && event.toolCallId === start.toolCallId,
  );
  const returns = events.filter(
    (event) =>
      event.type === 'TOOL_CALL_RESULT' &&
      event.toolCallId === start.toolCallId,
  );
  assert.equal(ends.length, 1, 'Matching server tool end required');
  assert.equal(returns.length, 1, 'Matching server tool result required');
  assert.ok(
    events.indexOf(start) < events.indexOf(ends[0]) &&
      events.indexOf(ends[0]) < events.indexOf(returns[0]),
    'Server tool wire order mismatch',
  );
  const native = callback.history?.flatMap((message) => message.parts) ?? [];
  const call = native.find(
    (part) =>
      part.part_kind === 'tool-call' &&
      part.tool_call_id === start.toolCallId &&
      part.tool_name === start.toolCallName,
  );
  const result = native.find(
    (part) =>
      part.part_kind === 'tool-return' &&
      part.tool_call_id === start.toolCallId &&
      part.tool_name === start.toolCallName,
  );
  assert.ok(
    call && result,
    'Callback native history does not match server tool wire',
  );
  assert.deepEqual(
    result.content,
    returns[0].content,
    'Callback result does not match wire result',
  );
  const run = events.find((event) => event.type === 'RUN_STARTED');
  assert.ok(
    run &&
      callback.requests?.some(
        (request) =>
          request.threadId === run.threadId && request.runId === run.runId,
      ),
    'Callback request does not match captured run',
  );
}

/**
 * Return direct references needed to validate an additive qualification as data only.
 * Nested wire and execution references are read from the retained capture separately.
 * @param record - Reviewed additive qualification record.
 * @returns Repository-relative retained file references.
 */
export function additionalReferences(record) {
  return [
    record.capture,
    ...record.sourceInputs,
    ...record.sources,
    ...record.claims.flatMap((claim) => claim.evidence),
  ];
}

/**
 * Validate a non-legacy qualification against retained raw wire and execution evidence.
 * Local identities are explicit and cannot imply CI acceptance. Legacy records never
 * pass through this validator. Native recovery remains outside this baseline.
 * @param record - Reviewed versioned profile record.
 * @param scenarios - Map of catalog scenario IDs to their required stages.
 * @param verifyFile - Pure verifier returning the exact retained file contents.
 * @returns A renderer-compatible profile with capabilities derived from claims.
 */
export function validateAdditionalQualification(record, scenarios, verifyFile) {
  if (record.evidenceCommit !== undefined)
    assert.match(
      record.evidenceCommit,
      /^[a-f0-9]{40}$/,
      'Exact evidence commit required',
    );
  assert.equal(
    record.id,
    `${record.framework}/${record.profile}`,
    'Profile identity mismatch',
  );
  assert.ok(record.framework && record.profile, 'Profile identity required');
  assert.match(
    record.sourceCommit,
    /^[a-f0-9]{40}$/,
    'Exact source commit required',
  );
  assert.match(
    record.qualifiedAt,
    /^\d{4}-\d{2}-\d{2}$/,
    'Qualification date required',
  );
  assert.equal(
    new Date(record.qualifiedAt).toISOString().slice(0, 10),
    record.qualifiedAt,
    'Invalid qualification date',
  );
  assert.ok(
    ['native', 'recipe'].includes(record.mode),
    'Unknown qualification mode',
  );
  assert.equal(
    Boolean(record.recipe),
    record.mode === 'recipe',
    'Native/recipe conflation',
  );
  if (record.recipe) {
    assert.ok(record.recipe.id, 'Recipe identity required');
    exactVersion(record.recipe.version);
  }
  assert.ok(
    ['local', 'ci'].includes(record.execution?.kind) &&
      record.execution.id?.trim(),
    'Explicit execution identity required',
  );
  if (record.execution.kind === 'local') {
    assert.ok(
      !record.ciRun && !record.ciUrl,
      'Local execution cannot claim CI provenance',
    );
  } else {
    assert.match(record.ciRun, /^\d+$/, 'Numeric CI run required');
    assert.equal(
      record.execution.id,
      record.ciRun,
      'CI execution identity mismatch',
    );
    assert.equal(
      record.ciUrl,
      `https://github.com/liveloveapp/hashbrown/actions/runs/${record.ciRun}`,
      'CI URL mismatch',
    );
  }
  assert.ok(
    Object.keys(record.versions).length,
    'Exact framework versions required',
  );
  Object.values(record.versions).forEach(exactVersion);
  exactVersion(record.runtime?.python);
  exactVersion(record.runtime?.uv);
  assert.ok(record.platform?.trim(), 'Platform required');
  assert.ok(
    record.protocol?.requested && record.protocol?.effective,
    'Requested and effective protocol required',
  );
  assert.equal(
    record.transport,
    'http-sse',
    'Real HTTP SSE transport required',
  );
  unique(
    record.sourceInputs.map((item) => item.path),
    'source inputs',
  );
  for (const name of [
    'pyproject.toml',
    'uv.lock',
    '.python-version',
    'host.py',
    'controller.mjs',
  ])
    assert.ok(
      record.sourceInputs.some((item) => item.path === prefix + name),
      `Missing source input ${name}`,
    );
  assert.ok(
    record.sourceInputs.some((item) =>
      /(?:_test\.py|\.spec\.[mt]?[jc]s)$/.test(item.path),
    ),
    'Assertion source input required',
  );
  record.sourceInputs.forEach(verifyFile);
  const sourceSha256 = hash(JSON.stringify(record.sourceInputs));
  assert.equal(
    record.capture.sourceSha256,
    sourceSha256,
    'Source input fingerprint mismatch',
  );
  const runtimeFile = record.sourceInputs.find(
    (item) => item.path === prefix + '.python-version',
  );
  assert.equal(
    verifyFile(runtimeFile).trim(),
    record.runtime.python,
    'Runtime pin mismatch',
  );
  const lock = verifyFile(
    record.sourceInputs.find((item) => item.path === prefix + 'uv.lock'),
  );
  const project = verifyFile(
    record.sourceInputs.find((item) => item.path === prefix + 'pyproject.toml'),
  );
  for (const [name, version] of Object.entries(record.versions)) {
    const packages = lock.split('[[package]]').slice(1);
    assert.ok(
      packages.some(
        (block) =>
          block.includes(`name = "${name}"`) &&
          block.includes(`version = "${version}"`),
      ),
      `Lock version mismatch: ${name}`,
    );
    if (name === 'pydantic-ai-slim')
      assert.ok(
        project.includes(`==${version}`),
        'Project dependency pin mismatch',
      );
  }
  unique(
    record.sources.map((source) => source.path),
    'qualification sources',
  );
  record.sources.forEach(verifyFile);
  const bound = (reference) => {
    assert.ok(
      record.sources.some(
        (source) =>
          source.path === reference.path && source.sha256 === reference.sha256,
      ),
      'Evidence source is not bound to qualification',
    );
    return verifyFile(reference);
  };
  record.sourceInputs.forEach(bound);
  const capture = JSON.parse(verifyFile(record.capture));
  for (const name of [
    'framework',
    'profile',
    'versions',
    'runtime',
    'platform',
    'protocol',
    'transport',
    'execution',
    'sourceInputs',
  ])
    assert.deepEqual(capture[name], record[name], `Capture ${name} mismatch`);
  assert.equal(capture.sourceSha256, sourceSha256, 'Capture source mismatch');
  assert.equal(
    capture.eventsSha256,
    hash(JSON.stringify(capture.events)),
    'Capture events hash mismatch',
  );
  const wire = bound(capture.wire);
  const events = wire
    .replaceAll('\r\n', '\n')
    .split('\n\n')
    .flatMap((frame) => {
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      return data ? [JSON.parse(data)] : [];
    });
  assert.ok(events.length, 'Actual wire events required');
  assert.deepEqual(events, capture.events, 'Wire events linkage mismatch');
  const summary = JSON.parse(bound(capture.executionSummary));
  assert.equal(
    summary.realFrameworkExecution,
    true,
    'Actual framework execution required',
  );
  for (const name of ['execution', 'runtime', 'versions'])
    assert.deepEqual(summary[name], record[name], `Execution ${name} mismatch`);
  assert.equal(summary.sourceSha256, sourceSha256, 'Execution source mismatch');
  assert.deepEqual(summary.wire, capture.wire, 'Execution wire mismatch');
  unique(
    record.claims.map((claim) => claim.capability),
    'capability claims',
  );
  unique(
    record.claims.map((claim) => claim.scenarioId),
    'scenario claims',
  );
  assert.ok(record.claims.length, 'Scenario claims required');
  const passedScenarios = new Set(
    record.claims
      .filter((claim) => claim.status === 'passed')
      .map((claim) => claim.scenarioId),
  );
  for (const claim of record.claims) {
    assert.ok(statuses.includes(claim.status), 'Unknown capability status');
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
      assert.ok(stages.includes(item.stage), 'Unknown evidence stage');
      assert.ok(results.includes(item.result), 'Unknown stage result');
      const observations = JSON.parse(bound(item));
      unique(
        observations.observations.map(
          (observation) => `${observation.scenarioId}/${observation.stage}`,
        ),
        'scenario-stage observations',
      );
      for (const observation of observations.observations) {
        assert.ok(
          scenarios.has(observation.scenarioId),
          'Unknown observation scenario',
        );
        assert.ok(
          stages.includes(observation.stage) &&
            results.includes(observation.result),
          'Unknown observation stage or result',
        );
        if (passedScenarios.has(observation.scenarioId))
          assert.equal(
            observation.result,
            'pass',
            'Passed claim has a non-passing retained observation',
          );
      }
      assert.equal(observations.profileId, record.id, 'Stage profile mismatch');
      assert.deepEqual(
        observations.execution,
        record.execution,
        'Stage execution mismatch',
      );
      assert.equal(
        observations.sourceSha256,
        sourceSha256,
        'Stage source mismatch',
      );
      assert.equal(
        observations.captureSha256,
        record.capture.sha256,
        'Stage capture mismatch',
      );
      assert.ok(
        observations.observations.some(
          (observation) =>
            observation.scenarioId === claim.scenarioId &&
            observation.stage === item.stage &&
            observation.result === item.result,
        ),
        'Retained stage observation mismatch',
      );
    }
    if (
      ['missing-upstream', 'recipe-required', 'unsupported'].includes(
        claim.status,
      )
    )
      assert.ok(
        claim.evidence.some(
          (item) =>
            item.result !== 'not-run' && item.result !== 'infrastructure-error',
        ),
        'Executed probe evidence required',
      );
    if (claim.status === 'passed') {
      const requireSource = (path) =>
        assert.ok(
          record.sourceInputs.some((source) => source.path === path),
          `Missing consumer assertion source ${path}`,
        );
      if (
        claim.evidence.some(
          (item) => item.stage === 'core-consumer' && item.result === 'pass',
        )
      )
        requireSource(
          'packages/core/src/models/pydantic-ai.conformance.spec.ts',
        );
      if (
        claim.evidence.some(
          (item) =>
            ['browser-react', 'browser-angular'].includes(item.stage) &&
            item.result === 'pass',
        )
      ) {
        requireSource('tools/conformance/pydantic-ai/pydantic-ai.spec.ts');
        requireSource('tools/conformance/pydantic-ai.playwright.config.ts');
      }
      if (
        ['actualServerToolExecution', 'liveStartBeforeToolCompletion'].includes(
          claim.capability,
        )
      )
        verifyServerCallback(summary, events, bound);
      if (claim.capability === 'liveStartBeforeToolCompletion') {
        assert.ok(
          summary.liveObservationsRef,
          'Raw causal live observations reference required',
        );
        const live = JSON.parse(bound(summary.liveObservationsRef));
        assert.equal(
          live.toolStartSeen,
          true,
          'Actual live tool start required',
        );
        assert.equal(
          live.completedBeforeRelease,
          0,
          'Tool completed before causal release',
        );
      }
      assert.ok(
        claim.evidence.every((item) => item.result === 'pass'),
        'Passed claim contains a non-passing stage',
      );
      assert.ok(
        !scenario.requiredStages.includes('native-recovery') &&
          !claim.evidence.some((item) => item.stage === 'native-recovery'),
        'Native recovery is outside this baseline',
      );
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
    framework: record.framework,
    profile: record.profile,
    id: record.id,
    versions: record.versions,
    status: 'qualified',
    capabilities: Object.fromEntries(
      record.claims.map((claim) => [claim.capability, claim.status]),
    ),
    qualification: record,
  };
}
