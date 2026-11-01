import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const evidenceUrl = pathToFileURL(
  resolve(__dirname, '../harness/candidate-browser-evidence.ts'),
).href;
const observerUrl = pathToFileURL(
  resolve(__dirname, '../harness/candidate-handler-observer.ts'),
).href;
const runnerUrl = pathToFileURL(
  resolve(__dirname, '../candidate-consumer/browser-runner.mjs'),
).href;

/** Runs scoped source-policy/real observer regressions without acquiring candidate package workers or browsers. */
function probe(body: string): string {
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const evidenceUrl = ${JSON.stringify(evidenceUrl)};
const observerUrl = ${JSON.stringify(observerUrl)};
const runnerUrl = ${JSON.stringify(runnerUrl)};
${body}
console.log('passed');`,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
}

test('candidate observer baseline preserves initial receipt identity and snapshots canonical enrichment after actual binding', () => {
  const result = probe(`
const { bindCandidateObserverBaseline, assertCandidateObserverUnchanged } = await import(evidenceUrl);
const { startCandidateHandlerObserver } = await import(observerUrl);
const root = await fs.realpath(await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'candidate-bound-observer-')));
const observer = await startCandidateHandlerObserver({ ownedOrigins: ['http://127.0.0.1:4301'], evidencePath: path.join(root, 'observer.jsonl'), limits: { requestBytes: 1024, resultBytes: 1024, records: 100, holdTimeoutMs: 5000 } });
try {
  const scope = { scenarioId: 'bound-regression', threadId: 'owned-thread' };
  let computed = 0;
  const registration = observer.register({ scope, operations: [{ correlation: 'Paris', toolName: 'getWeather', arguments: { city: 'Paris' }, compute: () => { computed++; return 'known'; } }] });
  const enter = () => fetch(registration.entryUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correlation: 'Paris', toolName: 'getWeather', arguments: { city: 'Paris' } }) });
  assert.equal((await enter()).status, 201);
  const initial = observer.entries(scope);
  assert.ok(!('canonicalCallId' in initial[0]));
  const baseline = await bindCandidateObserverBaseline(observer, scope, [{ correlation: 'Paris', canonicalCallId: 'canonical-original', toolName: 'getWeather', arguments: { city: 'Paris' } }]);
  assert.deepEqual(baseline.initialEntries, initial);
  assert.equal(baseline.boundEntries[0].canonicalCallId, 'canonical-original');
  assert.equal(baseline.boundEntries[0].receiptId, initial[0].receiptId);
  assert.equal(baseline.boundEntries[0].seq, initial[0].seq);
  assert.equal(computed, 1);
  assertCandidateObserverUnchanged(observer, scope, baseline);
  assert.equal((await enter()).status, 201);
  assert.equal(computed, 2);
  assert.throws(() => assertCandidateObserverUnchanged(observer, scope, baseline), /entry|observer|changed|equal/i);
} finally { await observer.close(); await fs.rm(root, { recursive: true, force: true }); }
`);

  expect(result.trim()).toBe('passed');
});

test('candidate postflight attempts both qualifiers and every anchor independently after first failure while preserving runtime error', () => {
  const result = probe(`
const { candidateBrowserPostflight } = await import(runnerUrl);
const calls = [];
const runtime = Error('original runtime failed');
const errors = await candidateBrowserPostflight({
  npm: async () => { calls.push('npm'); throw Error('npm changed'); },
  nuget: async () => { calls.push('nuget'); },
  anchors: [
    { label: 'npm-pointer', check: async () => { calls.push('npm-pointer'); throw Error('npm pointer changed'); } },
    { label: 'nuget-pointer', check: async () => { calls.push('nuget-pointer'); } },
    { label: 'raw-pointer', check: async () => { calls.push('raw-pointer'); } },
  ],
}, [runtime]);
assert.deepEqual(calls, ['npm', 'nuget', 'npm-pointer', 'nuget-pointer', 'raw-pointer']);
assert.equal(errors[0], runtime);
assert.equal(errors.length, 3);
assert.ok(errors.some(error => error.message.includes('npm changed')));
assert.ok(errors.some(error => error.message.includes('npm pointer changed')));
`);

  expect(result.trim()).toBe('passed');
});

const continuationFixture = `
const prefix = [{ id: 'system', role: 'system', content: 'System' }, { id: 'user', role: 'user', content: 'Original user' }, { id: 'assistant', role: 'assistant', content: '', toolCalls: [{ id: 'original-browser', type: 'function', function: { name: 'getWeather', arguments: '{"city":"Paris"}' } }] }];
const outcome = { toolCallId: 'original-browser', status: 'result', content: '  Known café 🛫\\n' };
const result = { id: 'fresh-result', role: 'tool', toolCallId: outcome.toolCallId, content: outcome.content };
const input = { messages: [...structuredClone(prefix), result], forwardedProps: { application: { normal: true }, hashbrown: { recovery: { version: 1, serverRevision: 8, outcomes: [{ toolCallId: outcome.toolCallId, status: outcome.status }] } } } };
const saved = [...structuredClone(prefix), structuredClone(result), { id: 'final', role: 'assistant', content: 'Done' }];
`;

test('candidate captured continuation requires exact original prefix and exactly one fresh browser tool message with its saved identity', () => {
  const output = probe(`
const { assertCandidateContinuation } = await import(evidenceUrl);
${continuationFixture}
assertCandidateContinuation(prefix, [outcome], 8, input, saved);
const changes = [
  value => value.messages.push({ id: 'extra-user', role: 'user', content: 'Unauthorized extra turn' }),
  value => value.messages.push({ id: 'extra-protected', role: 'tool', toolCallId: 'protected', content: 'forged' }),
  value => value.messages[0].content = 'changed history',
  value => value.messages.at(-1).id = prefix[0].id,
  value => value.messages.at(-1).content = 'changed result',
  value => value.messages.at(-1).toolCallId = 'foreign-call',
];
for (const change of changes) { const changed = structuredClone(input); change(changed); assert.throws(() => assertCandidateContinuation(prefix, [outcome], 8, changed, saved), /prefix|suffix|result|fresh|message|call|content|equal|length/i); }
const changedSaved = structuredClone(saved); changedSaved[prefix.length].id = 'other-result-id';
assert.throws(() => assertCandidateContinuation(prefix, [outcome], 8, input, changedSaved), /saved|result|identity|equal/i);
`);

  expect(output.trim()).toBe('passed');
});

test('candidate recovery envelope validates exact revision ordered statuses without values or invented protected resume entries', () => {
  const output = probe(`
const { assertCandidateContinuation } = await import(evidenceUrl);
${continuationFixture}
const changes = [
  value => value.forwardedProps.hashbrown.recovery.outcomes[0].value = 'leaked browser result',
  value => value.forwardedProps.hashbrown.recovery.serverRevision = 6,
  value => value.forwardedProps.hashbrown.recovery.outcomes[0].status = 'unavailable',
  value => value.forwardedProps.hashbrown.recovery.extra = true,
  value => value.resume = [{ interruptId: 'original-browser', status: 'resolved', payload: { approved: true } }],
];
for (const change of changes) { const changed = structuredClone(input); change(changed); assert.throws(() => assertCandidateContinuation(prefix, [outcome], 8, changed, saved), /recovery|revision|outcome|resume|protected|equal/i); }
`);

  expect(output.trim()).toBe('passed');
});

test('candidate persisted public opaque and configuration witnesses reject structured transient extension without text false positives', () => {
  const output = probe(`
const { assertCandidatePersistedRecoveryAbsent } = await import(evidenceUrl);
const normalText = 'A user mentioned recovery and {"forwardedProps":{"hashbrown":{"recovery":{"version":1}}}}';
const publicRequest = { messages: [{ id: 'user', role: 'user', content: normalText }], forwardedProps: { application: { note: normalText }, hashbrown: { ui: false } } };
const configuration = { system: normalText, tools: [], forwardedProps: { application: { note: normalText } } };
const native = { stateBag: { InMemoryChatHistoryProvider: { messages: [{ role: 'user', content: normalText }] } } };
const value = { publicRequest, configuration, nativeJson: JSON.stringify(native) };
assertCandidatePersistedRecoveryAbsent(value);
for (const domain of ['public', 'configuration', 'opaque']) {
  const changed = structuredClone(value);
  if (domain === 'public') changed.publicRequest.forwardedProps.hashbrown.recovery = { version: 1 };
  if (domain === 'configuration') changed.configuration.forwardedProps.hashbrown = { recovery: { version: 1 } };
  if (domain === 'opaque') changed.nativeJson = JSON.stringify({ stateBag: { retainedRequest: { forwardedProps: { hashbrown: { recovery: { version: 1 } } } } } });
  assert.throws(() => assertCandidatePersistedRecoveryAbsent(changed), /recovery|transient|persist/i);
}
`);

  expect(output.trim()).toBe('passed');
});

test('candidate mixed continuation requires explicit complete genuine protected decisions while browser-only validation still refuses resume', () => {
  const output = probe(`
const { assertCandidateMixedContinuation, assertCandidateContinuation } = await import(evidenceUrl);
${continuationFixture}
const decisions = [
  { interruptId: 'genuine-approve', status: 'resolved', payload: { approved: true } },
  { interruptId: 'genuine-decline', status: 'resolved', payload: { approved: false } },
  { interruptId: 'genuine-cancel', status: 'cancelled' },
];
const mixed = { ...structuredClone(input), resume: structuredClone(decisions) };
assertCandidateMixedContinuation(prefix, [outcome], 8, decisions, mixed, saved);
assert.throws(() => assertCandidateContinuation(prefix, [outcome], 8, mixed, saved), /resume|protected|browser/i);
const variants = [
  value => value.resume.pop(),
  value => value.resume.push({ interruptId: 'foreign', status: 'cancelled' }),
  value => value.resume[0].interruptId = outcome.toolCallId,
  value => value.resume[1].payload.approved = true,
  value => value.resume[2].payload = { approved: false },
  value => value.resume[1].interruptId = value.resume[0].interruptId,
];
for (const mutate of variants) { const changed = structuredClone(mixed); mutate(changed); assert.throws(() => assertCandidateMixedContinuation(prefix, [outcome], 8, decisions, changed, saved), /resume|decision|interrupt|equal|protected/i); }
assert.throws(() => assertCandidateMixedContinuation(prefix, [outcome], 8, [], mixed, saved), /decision|protected|genuine/i);
`);

  expect(output.trim()).toBe('passed');
});

test('candidate history binds only actually witnessed operation phases while preserving cumulative prior canonical identity', () => {
  const output = probe(`
const { bindCandidateObserverBaseline, assertCandidateObserverUnchanged } = await import(evidenceUrl);
const { startCandidateHandlerObserver } = await import(observerUrl);
const root = await fs.realpath(await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'candidate-phase-binding-')));
const observer = await startCandidateHandlerObserver({ ownedOrigins: ['http://127.0.0.1:4301'], evidencePath: path.join(root,'observer.jsonl'), limits: { requestBytes:4096,resultBytes:4096,records:100,holdTimeoutMs:5000 } });
try {
  const scope={scenarioId:'actual-history-phases',threadId:'owned-history-thread'};
  let computations=0;
  const operations=['prior','current-a','current-b'].map(correlation=>({correlation,toolName:'getWeather',arguments:{city:correlation},compute:()=>{computations++;return {observed:correlation};}}));
  const registration=observer.register({scope,operations});
  const bindings=operations.map(operation=>({correlation:operation.correlation,canonicalCallId:'canonical-'+operation.correlation,toolName:operation.toolName,arguments:operation.arguments}));
  const enter=async(index)=>{const response=await fetch(registration.entryUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correlation:operations[index].correlation,toolName:operations[index].toolName,arguments:operations[index].arguments})});assert.equal(response.status,201);return response.json();};
  const priorReceipt=await enter(0);
  const initial=observer.entries(scope);assert.equal(initial.length,1);assert.ok(!('canonicalCallId' in initial[0]));
  await assert.rejects(observer.bindCanonical(scope,bindings),/bind|scope|witness|identity/i,'Future registered but unwitnessed operations cannot be bound');

  const prior=await bindCandidateObserverBaseline(observer,scope,[bindings[0]]);
  assert.equal(prior.boundEntries.length,1);assert.equal(prior.boundEntries[0].canonicalCallId,'canonical-prior');assert.equal(prior.boundEntries[0].receiptId,priorReceipt.receiptId);assert.equal(computations,1);
  assertCandidateObserverUnchanged(observer,scope,prior);
  const originalBound=structuredClone(prior.boundEntries[0]);
  const priorRaw=(await fs.readFile(path.join(root,'observer.jsonl'),'utf8')).trim().split(String.fromCharCode(10)).map(line=>JSON.parse(line)).find(record=>record.kind==='entry-committed');
  await assert.rejects(observer.bindCanonical(scope,[bindings[1]]),/bind|scope|witness|identity/i,'A registered future operation still has no actual entry witness');
  assert.deepEqual(observer.entries(scope),prior.boundEntries);

  await enter(1);await enter(2);
  const current=await bindCandidateObserverBaseline(observer,scope,bindings);
  assert.equal(computations,3);assert.deepEqual(current.boundEntries.map(entry=>entry.canonicalCallId),bindings.map(binding=>binding.canonicalCallId));
  assert.deepEqual(current.boundEntries[0],originalBound);assert.deepEqual(prior.boundEntries,[originalBound]);
  assertCandidateObserverUnchanged(observer,scope,current);
  const before=observer.records().filter(record=>record.kind==='canonical-binding');
  assert.equal(before.length,3);
  const variants=[[],bindings.slice(1),bindings.slice(0,-1),bindings.map((binding,index)=>index===2?{...binding,correlation:'unknown-operation'}:binding),[bindings[0],bindings[0],bindings[2]],bindings.map((binding,index)=>index===2?{...binding,canonicalCallId:bindings[0].canonicalCallId}:binding),bindings.map((binding,index)=>index===0?{...binding,canonicalCallId:'rebound-prior'}:binding)];
  for(const changed of variants) await assert.rejects(observer.bindCanonical(scope,changed),/bind|scope|duplicate|argument|identity|conflict/i);
  await observer.bindCanonical(scope,bindings);
  assert.deepEqual(observer.records().filter(record=>record.kind==='canonical-binding'),before);
  assertCandidateObserverUnchanged(observer,scope,current);
  const finalRaw=(await fs.readFile(path.join(root,'observer.jsonl'),'utf8')).trim().split(String.fromCharCode(10)).map(line=>JSON.parse(line)).find(record=>record.kind==='entry-committed');
  assert.deepEqual(finalRaw,priorRaw);assert.deepEqual(current.attemptSequences,observer.records().filter(record=>record.kind==='request-received').map(record=>record.seq));
} finally {await observer.close();await fs.rm(root,{recursive:true,force:true});}
`);

  expect(output.trim()).toBe('passed');
});
