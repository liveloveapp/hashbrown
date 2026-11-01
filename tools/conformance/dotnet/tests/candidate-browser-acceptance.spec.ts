import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const acceptanceUrl = pathToFileURL(
  resolve(__dirname, '../harness/candidate-browser-acceptance.ts'),
).href;

/** Exercises isolated acceptance counterexamples; parsed fixtures supply no native or browser execution authority. */
function probe(body: string): string {
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
import assert from 'node:assert/strict';
const subject = await import(${JSON.stringify(acceptanceUrl)});
${body}
console.log('passed');`,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
}

test('provider history requires exact ordered role-aware text multiplicity rather than flattened string membership', () => {
  const result = probe(`
const { assertCandidateProviderTextHistory: check } = subject;
const prefix = [{role:'system',content:'trusted'}, {role:'user',content:'earlier question'}, {role:'assistant',content:'earlier answer'}, {role:'user',content:'current question'}, {role:'assistant',content:'announcement',toolCalls:[{id:'b',function:{name:'getWeather',arguments:'{}'}}]}];
for (const api of ['chat-completions','responses']) {
  const key = api === 'responses' ? 'input' : 'messages';
  const good = prefix.map(({role,content}) => ({role,content: api === 'responses' ? [{type:role==='assistant'?'output_text':'input_text',text:content}] : content}));
  if (api === 'responses') good.push({type:'function_call',call_id:'b',name:'getWeather',arguments:'{}'},{type:'function_call_output',call_id:'b',output:'known'});
  else good.push({role:'assistant',tool_calls:[{id:'b',type:'function',function:{name:'getWeather',arguments:'{}'}}]},{role:'tool',tool_call_id:'b',content:'known'});
  check({[key]:good}, api, prefix);
  const mutations = [
    [good[0],good[2],good[1],...good.slice(3)],
    [...good.slice(0,2),good[1],...good.slice(2)],
    good.map((message,index) => index===1 ? {...message,role:'assistant'} : message),
    [...good.slice(0,2),...good.slice(3),{role:'tool',content:'earlier answer',tool_call_id:'unrelated'}],
    good.map((message,index) => index===2 ? {role:'assistant',content:[],metadata:{content:'earlier answer'}} : message),
  ];
  for (const changed of mutations) assert.throws(() => check({[key]:changed},api,prefix), /text|history|role|prefix|equal|order/i);
}
`);

  expect(result.trim()).toBe('passed');
});

test('schema-owning facades require actual immutable schema on original continuation and ordinary provider requests', () => {
  const result = probe(`
const { assertCandidateFacadeSchema: check } = subject;
const schema = {type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false};
const configuration = {system:'trusted',forwardedProps:{hashbrown:{responseSchema:schema},extension:{owned:true}}};
for (const api of ['chat-completions','responses']) for (const facade of ['structured-chat','structured-completion','ui-chat','ui-completion']) {
  const good = api==='responses' ? {text:{format:{type:'json_schema',name:'hashbrown',schema,strict:true}}} : {response_format:{type:'json_schema',json_schema:{name:'hashbrown',schema,strict:true}}};
  check(facade,api,configuration,[good,good,good]);
  for (const missing of [{},{forwardedProps:{}},{forwardedProps:{hashbrown:{}}}]) assert.throws(() => check(facade,api,missing,[good,good,good]), /schema|configuration|missing|required/i);
  for (let index=0;index<3;index++) {
    const changed=[structuredClone(good),structuredClone(good),structuredClone(good)]; changed[index]={};
    assert.throws(() => check(facade,api,configuration,changed), /schema|format|equal|required/i);
  }
  const changed=structuredClone(good); const format=api==='responses'?changed.text.format:changed.response_format.json_schema; format.strict=false;
  assert.throws(() => check(facade,api,configuration,[good,changed,good]), /schema|strict|equal|format/i);
}
for (const facade of ['chat','completion']) check(facade,'chat-completions',{system:'trusted'},[{}]);
`);

  expect(result.trim()).toBe('passed');
});

test('Busy flow explicitly reconciles the previously blocked reader after genuine owner completion and retains read errors', () => {
  const result = probe(`
const { reconcileCandidateBusyReader: reconcile } = subject;
const calls=[];
await reconcile(async()=>{calls.push('owner-completed');},async()=>{assert.deepEqual(calls,['owner-completed']);calls.push('blocked-reader-V2-read');});
assert.deepEqual(calls,['owner-completed','blocked-reader-V2-read']);
const failure=Error('blocked reader could not adopt authoritative completion');
await assert.rejects(reconcile(async()=>undefined,async()=>{throw failure;}),error=>error===failure);
`);

  expect(result.trim()).toBe('passed');
});

test('corrupt acceptance requires only genuine browser binding removal and specific delivered503 without fabricated error body', () => {
  const result = probe(`
const { assertCandidateCorruptionEvidence: check } = subject;
const original={publicRequest:'{"messages":[{"id":"original","role":"user","content":"retained"}]}',nativeJson:'{"retained":true}',approvals:{pendingBatch:{batch:{batchId:'genuine-batch',browserBindings:[{callId:'b',requestId:'browser-binding'}],protectedRequests:[{requestId:'p'}]}}}};
const removed=structuredClone(original); removed.approvals.pendingBatch.batch.browserBindings=[];
const response={status:503,body:null};
check(JSON.stringify(original),JSON.stringify(removed),response);
for (const status of [404,500,502]) assert.throws(()=>check(JSON.stringify(original),JSON.stringify(removed),{status,body:null}), /503|status|corrupt|equal/i);
assert.throws(()=>check(JSON.stringify(original),JSON.stringify(original),response), /binding|corrupt|equal|empty/i);
const unrelated=structuredClone(removed);unrelated.nativeJson='{"tampered":true}';
assert.throws(()=>check(JSON.stringify(original),JSON.stringify(unrelated),response), /native|preserv|corrupt|equal|binding/i);
assert.throws(()=>check(JSON.stringify(removed),JSON.stringify(removed),response), /original|binding|nonempty|empty/i);
`);

  expect(result.trim()).toBe('passed');
});

test('ambiguity and rejection reconciliation require successful freshV2 disposition and server revision matching real journal authority', () => {
  const result = probe(`
const { assertCandidateAuthoritativeResponse: check } = subject;
const ready={state:'Ready',revision:17};
const completed={status:200,body:{schemaVersion:2,disposition:'Completed',serverRevision:17,snapshot:{messages:[],pendingBrowserRecovery:null}}};
check(completed,ready);
check({status:200,body:{schemaVersion:2,disposition:'Busy',serverRevision:18,snapshot:null}},{state:'Owned',revision:18});
check({status:200,body:{schemaVersion:2,disposition:'UnknownEffect',serverRevision:19,snapshot:null}},{state:'Blocked',revision:19});
for (const status of [404,500,503]) assert.throws(()=>check({status,body:null},ready), /200|success|authoritative|status|equal/i);
for (const change of [{schemaVersion:1},{serverRevision:16},{disposition:'Busy'},{disposition:'unsupported'}]) assert.throws(()=>check({status:200,body:{...completed.body,...change}},ready), /V2|version|revision|disposition|state|authoritative|equal/i);
assert.throws(()=>check(completed,null), /journal|session|authority|missing/i);
`);

  expect(result.trim()).toBe('passed');
});

test('each failure requires its actual per-run proxy intervention with independentACK domains and rejects unrelated infrastructurefault', () => {
  const result = probe(`
const { assertCandidateProxyIntervention: check } = subject;
const record=(kind,extra={})=>({kind,requestId:'actual-request',bytes:Buffer.alloc(0),...extra});
const source=Buffer.from('data: {"type":"RUN_STARTED","runId":"actual-run"}\\n\\ndata: {"type":"TEXT_MESSAGE_START","messageId":"m"}\\n\\n');
const delivered=Buffer.from(source.toString().replace('{"type":"TEXT_MESSAGE_START"','!"type":"TEXT_MESSAGE_START"'));
const mode='malform-after-upstream-ack';
const good={scenario:'failure.malformed-ack',requestId:'actual-request',runId:'actual-run',records:[record('upstream-body',{bytes:source}),record('upstream-ack'),record('downstream-ack-write'),record('mutation',{reason:mode}),record('delivered-body',{bytes:delivered})],events:[{type:'RUN_STARTED',runId:'actual-run'}],transport:[]};
check(good);
for (const changed of [good.records.filter(r=>r.kind!=='mutation'),good.records.map(r=>r.kind==='mutation'?{...r,reason:'disconnect-after-delivered-ack'}:r),[...good.records,record('fault',{reason:'Actual post-ACK JSON frame required'})],good.records.map(r=>r.kind==='delivered-body'?{...r,bytes:source}:r)]) assert.throws(()=>check({...good,records:changed}), /mutation|intervention|fault|malform|bytes|source|equal/i);
const pre={...good,scenario:'failure.preack-disconnect',records:[record('upstream-body',{bytes:source}),record('upstream-ack'),record('mutation',{reason:'disconnect-before-delivered-ack'})],events:[]};check(pre);
assert.throws(()=>check({...pre,events:[{type:'RUN_STARTED',runId:'actual-run'}]}), /ACK|ack|consum|event|pre|equal/i);
assert.throws(()=>check({...pre,records:[record('upstream-body',{bytes:source})]}), /mutation|intervention|ack|source|boundary/i);
const timeout={...pre,scenario:'failure.timeout',records:[record('upstream-body',{bytes:source}),record('upstream-ack'),record('downstream-closed')],transport:[{kind:'deadline',abortSource:'deadline'}]};
check(timeout);
assert.throws(()=>check({...timeout,transport:[{kind:'aborted',abortSource:'deadline'}]}),/deadline|abort/i);
assert.throws(()=>check({...timeout,transport:[{kind:'deadline',abortSource:'caller'}]}),/deadline|abort/i);
`);

  expect(result.trim()).toBe('passed');
});

test('final acceptance joins owned proxy drain before validating late per-run faults and retains both cleanup and validation errors', () => {
  const result = probe(`
const { finalizeCandidateAcceptance: finish, assertCandidateProxyIntervention: check } = subject;
const record=(kind,extra={})=>({kind,requestId:'actual-request',bytes:Buffer.alloc(0),...extra});
const source=Buffer.from('data: {"type":"RUN_STARTED","runId":"actual-run"}\\n\\n');
const observation={scenario:'failure.preack-disconnect',requestId:'actual-request',runId:'actual-run',records:[record('upstream-body',{bytes:source}),record('upstream-ack'),record('mutation',{reason:'disconnect-before-delivered-ack'}),record('downstream-closed')],events:[],transport:[]};
const order=[];
await finish(async()=>{order.push('close-start');await Promise.resolve();order.push('proxy-handler-drained');},()=>{order.push('validate-final-records');check(observation);});
assert.deepEqual(order,['close-start','proxy-handler-drained','validate-final-records']);
const late={...observation,records:[...observation.records]};
let appended=false;
await assert.rejects(finish(async()=>{await Promise.resolve();late.records.push(record('fault',{reason:'late unexpected upstream decoder failure'}));appended=true;},()=>check(late)), /acceptance|cleanup|fault/i);
assert.equal(appended,true,'The asynchronous proxy processing must actually finish');
const closeError=Error('actual proxy drain failed');const validationError=Error('final intervention records invalid');
try {await finish(async()=>{await Promise.resolve();throw closeError;},()=>{throw validationError;});assert.fail('Both independent failures must propagate');}
catch(error){assert.ok(error instanceof AggregateError);assert.ok(error.errors.includes(closeError));assert.ok(error.errors.includes(validationError));}
`);

  expect(result.trim()).toBe('passed');
});

test('definitive413 final receipt requires delivered rejection complete unchanged entity and no late per-run proxy fault', () => {
  const result = probe(`
const { assertCandidateDefinitiveRejection: check, finalizeCandidateAcceptance: finish } = subject;
const record=(kind,extra={})=>({kind,requestId:'rejected-request',bytes:Buffer.alloc(0),...extra});
const good={requestId:'rejected-request',runId:'rejected-run',records:[record('request',{incomingBody:Buffer.from(JSON.stringify({runId:'rejected-run',messages:[]}))}),record('upstream-headers',{status:413}),record('delivered-headers',{status:413}),record('complete')]};
check(good); // Actual empty HTTP entity is accepted without inventing a JSON error body.
const entity=Buffer.from('actual opaque rejection entity');
check({...good,records:[...good.records,record('upstream-body',{bytes:entity}),record('delivered-body',{bytes:entity})]});
for(const changed of [good.records.filter(r=>r.kind!=='delivered-headers'),good.records.map(r=>r.kind==='delivered-headers'?{...r,status:502}:r),good.records.filter(r=>r.kind!=='complete'),[...good.records,record('upstream-body',{bytes:entity}),record('delivered-body',{bytes:Buffer.from('changed entity')})],[...good.records,record('mutation',{reason:'unexpected'})],[...good.records,record('upstream-ack')],good.records.map(r=>r.kind==='request'?{...r,incomingBody:Buffer.from(JSON.stringify({runId:'other-run',messages:[]}))}:r)]) assert.throws(()=>check({...good,records:changed}),/413|deliver|complete|entity|bytes|fault|mutation|ACK|ack|run|request|equal/i);
const late={...good,records:[...good.records]};let drained=false;
await assert.rejects(finish(async()=>{await Promise.resolve();late.records.push(record('fault',{reason:'late rejection delivery failure'}));drained=true;},()=>check(late)),/acceptance|cleanup|fault|rejection/i);
assert.equal(drained,true);
`);

  expect(result.trim()).toBe('passed');
});
