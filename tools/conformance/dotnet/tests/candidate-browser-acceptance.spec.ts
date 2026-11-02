import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const acceptanceUrl = pathToFileURL(
  resolve(__dirname, '../harness/candidate-browser-acceptance.ts'),
).href;

test('snapshotless authoritative metadata preserves an inert pre-ACK batch and cannot mint or erase local authority', () => {
  const output = probe(`
const before={pending:{id:'actual-old-token',serverRevision:6,toolCalls:[{id:'browser',name:'getWeather',arguments:{city:'owned'}}],interrupts:[{id:'ficc_protected',toolCallId:'protected',reason:'tool_call'}]},pendingInterrupts:{id:'warm-token',interrupts:[{id:'ficc_protected'}]},messages:[{id:'user',role:'user',content:'actual history'}],state:{owned:true},recovery:{revision:9,required:true}};
const response={schemaVersion:2,disposition:'UnknownEffect',serverRevision:10};

subject.assertCandidateReadAdoption(response,before,structuredClone(before));
const mutations=[value=>value.pending=null,value=>value.pending.id='minted-token',value=>value.pending.toolCalls=[],value=>value.pendingInterrupts=null,value=>value.messages.push({id:'invented',role:'assistant',content:'invented'}),value=>value.state={owned:false},value=>value.recovery.revision++,value=>value.recovery.required=false];
for(const mutate of mutations){const after=structuredClone(before);mutate(after);assert.throws(()=>subject.assertCandidateReadAdoption(response,before,after),/pending|snapshot|authorit|preserv|history|state|revision|required|equal/i);}
const unblocked=structuredClone(before);unblocked.recovery.required=false;assert.throws(()=>subject.assertCandidateReadAdoption(response,unblocked,structuredClone(unblocked)),/required|inert|barrier|authorit/i);
const fresh={pending:null,pendingInterrupts:null,messages:[],state:null,recovery:{revision:0,required:false}};
subject.assertCandidateReadAdoption(response,fresh,structuredClone(fresh));
assert.throws(()=>subject.assertCandidateReadAdoption(response,fresh,{...fresh,pending:before.pending}),/pending|snapshot|authorit|equal/i);
const completed={disposition:'Completed',snapshot:{threadId:'owned-thread',messages:before.messages,state:before.state}};
subject.assertCandidateReadAdoption(completed,before,{...before,pending:null});
assert.throws(()=>subject.assertCandidateReadAdoption(completed,before,structuredClone(before)),/pending|complete|clear|equal/i);
`);

  expect(output.trim()).toBe('passed');
});

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

test('original protocol completion permits only exact delivered postterminal disposal and refuses all earlier or unrelated fault classes', () => {
  const result = probe(`
const {captureCandidateOriginalRun:capture}=subject;
const {expectNativeRunCapture:decode}=await import(${JSON.stringify(pathToFileURL(resolve(__dirname, '../harness/native-wire.ts')).href)});
const requestId='actual-original-request',runId='actual-original-run';
const frame=event=>Buffer.from('data: '+JSON.stringify(event)+String.fromCharCode(10,10));
const events=[{type:'RUN_STARTED',threadId:'owned-thread',runId},{type:'TOOL_CALL_START',toolCallId:'original-browser',toolCallName:'getWeather',parentMessageId:'actual-parent'},{type:'TOOL_CALL_ARGS',toolCallId:'original-browser',delta:'{"city":"Owned current city 1"}'},{type:'TOOL_CALL_END',toolCallId:'original-browser'},{type:'RUN_FINISHED',threadId:'owned-thread',runId}];
const record=(seq,kind,extra={})=>({requestId,seq,kind,bytes:Buffer.alloc(0),...extra});
const good=events.flatMap((event,index)=>[record(7+index*2,'upstream-body',{bytes:frame(event)}),record(8+index*2,'delivered-body',{bytes:frame(event)})]);
good.push(record(17,'downstream-closed'),record(18,'fault',{reason:'aborted'}));
assert.deepEqual(capture(good,requestId,decode),events,'Normal actual terminal disposal is not a truncated protocol');
assert.deepEqual(capture(good.filter(item=>item.kind!=='fault'),requestId,decode),events);
assert.deepEqual(capture([...good,{...record(3,'fault',{reason:'foreign infrastructure fault'}),requestId:'another-request'}],requestId,decode),events,'Classification must remain scoped to the actual request');
const variants=[
 good.map(item=>item.kind==='fault'?{...item,seq:6}:item).sort((a,b)=>a.seq-b.seq),
 good.filter(item=>item.seq!==15&&item.seq!==16),
 good.map(item=>item.kind==='fault'?{...item,reason:'Response byte limit'}:item),
 good.map(item=>item.kind==='fault'?{...item,reason:'unexpected source failure'}:item),
 [...good,record(19,'mutation',{reason:'unexpected mutation'})],
 good.filter(item=>item.kind!=='downstream-closed'),
 good.map(item=>item.seq===16?{...item,bytes:Buffer.from('changed delivered terminal')}:item),
 [...good,record(19,'upstream-body',{bytes:Buffer.from(String.fromCharCode(10))}),record(20,'delivered-body',{bytes:Buffer.from(String.fromCharCode(10))})],
 good.filter(item=>item.seq!==16),
];
for(const changed of variants) assert.throws(()=>capture(changed,requestId,decode),/fault|dispos|terminal|truncat|protocol|source|deliver|mutation|close|expect|equal|false|true/i);
`);

  expect(result.trim()).toBe('passed');
});

/** Parsed fixture facts exercise acceptance policy only; these are not claimed runtime/PG observations. */
const warmPhaseFixture = `
function phaseFacts(mixed=true) {
 const b={id:'current-browser-1',name:'getWeather',arguments:{city:'Owned current city'},correlation:'Owned current city'};
 const p={id:'current-protected-1',name:'lookupAirport',arguments:{code:'PDX'}};
 const interrupt={id:'ficc_current-protected-1',reason:'tool_call',toolCallId:p.id,message:'Approval required for tool call: lookupAirport',responseSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved']}};
 const fn=call=>({id:call.id,type:'function',function:{name:call.name,arguments:JSON.stringify(call.arguments)}});
 const messages=[{id:'system',role:'system',content:'trusted'},{id:'earlier-parent',role:'assistant',content:'Earlier announcement',toolCalls:[fn({id:'history-entered-browser',name:'getWeather',arguments:{city:'Historical city'}}),fn({id:'earlier-native',name:'lookupAirport',arguments:{code:'ATL'}})]},{id:'earlier-browser-result',role:'tool',toolCallId:'history-entered-browser',content:'Historical exact'},{id:'earlier-native-result',role:'tool',toolCallId:'earlier-native',content:'{"code":"ATL","name":"Portland International Airport"}'},{id:'current-parent',role:'assistant',content:'Current announcement',toolCalls:[fn(b),...(mixed?[fn(p)]:[])]}];
 const pendingBatch=mixed?{batch:{batchId:'actual-saved-batch',protectedRequests:[{requestId:interrupt.id,call:{...p,version:1},nativeLocation:{messageId:'native-current',messageIndex:null,contentIndex:1},requiresConfirmation:true}],browserBindings:[{requestId:'ficc_current-browser-1',callId:b.id,name:b.name,arguments:b.arguments,nativeLocation:{messageId:'native-current',messageIndex:null,contentIndex:0},requiresConfirmation:false}]},publicLocations:{[interrupt.id]:{assistantMessageId:'current-parent',messageIndex:4,callIndex:1},ficc_currentBrowser:{assistantMessageId:'current-parent',messageIndex:4,callIndex:0}}}:null;
 if(pendingBatch){pendingBatch.publicLocations['ficc_current-browser-1']=pendingBatch.publicLocations.ficc_currentBrowser;delete pendingBatch.publicLocations.ficc_currentBrowser;}
 const payload={formatVersion:2,nativeJson:JSON.stringify({retainedNativeSession:'opaque-original'}),publicRequest:JSON.stringify({threadId:'owned-thread',messages,tools:[{name:'getWeather',description:'Owned browser',parameters:{type:'object',properties:{city:{type:'string'}},required:['city']}}],forwardedProps:{}}),pendingCalls:mixed?[{...p,version:1}]:[],expectedBrowserCallIds:[b.id],turnCompleted:false,approvals:{pendingBatch}};
 const before={entries:[{seq:2,receiptId:'historical-receipt',correlation:'Historical city',canonicalCallId:'history-entered-browser',toolName:'getWeather',arguments:{city:'Historical city'},result:'Historical exact'}],attemptSequences:[1,3],holdReceiptIds:['historical-receipt'],computations:1,providerRequests:[{body:{historical:'initial'}},{body:{historical:'continuation'}}],effects:[{id:1,call_id:'earlier-native',code:'ATL'}],nativeWitnesses:[{seq:1,callId:'earlier-native',runId:'earlier-run',domain:'native-outward-before-public-projection'}]};
 const after=structuredClone(before);after.providerRequests.push({body:{current:'initial'}});
 if(!mixed){after.entries.push({seq:20,receiptId:'current-receipt',correlation:b.correlation,toolName:b.name,arguments:b.arguments,result:'Declared known'});after.attemptSequences.push(19,21);after.holdReceiptIds.push('current-receipt');after.computations++;}
 return {expected:{runId:'original-run',threadId:'owned-thread',browsers:[b],protected:mixed?[p]:[]},sourceEvents:[{type:'RUN_STARTED',threadId:'owned-thread',runId:'original-run'},{type:'TOOL_CALL_START',toolCallId:b.id,toolCallName:b.name,parentMessageId:'current-parent'},...(mixed?[{type:'TOOL_CALL_START',toolCallId:p.id,toolCallName:p.name,parentMessageId:'current-parent'}]:[]),{type:'RUN_FINISHED',threadId:'owned-thread',runId:'original-run',...(mixed?{outcome:{type:'interrupt',interrupts:[structuredClone(interrupt)],pendingToolCallIds:[b.id]}}:{})}],publicState:{threadId:'owned-thread',pendingInterrupts:mixed?{id:'genuine-warm-token',interrupts:[structuredClone(interrupt)]}:null,pendingConversationRecovery:null,events:[{type:'RUN_FINISHED',runId:'original-run'}]},savedSession:{state:'Ready',revision:23,payload:JSON.stringify(payload)},before,after};
}
function changePayload(facts,mutate){const payload=JSON.parse(facts.savedSession.payload);mutate(payload);facts.savedSession.payload=JSON.stringify(payload);}
`;

test('warm mixed admission is corroborated by actual-shaped source public batch and saved pending payload while preserving prior totals', () => {
  const output = probe(`
${warmPhaseFixture}
const facts=phaseFacts(true);
assert.equal(subject.classifyCandidateWarmPhase(facts),'paused-for-protected-interrupt');
assert.equal(facts.before.entries.length,1);assert.equal(facts.after.entries.length,1);assert.equal(facts.after.effects.length,1);assert.equal(facts.after.providerRequests.length,3);
assert.equal(subject.classifyCandidateWarmPhase(phaseFacts(false)),'entered-browser-handler');
`);

  expect(output.trim()).toBe('passed');
});

test('warm admission rejects false-zero labels incomplete terminals mismatched public PG identity and invented current bindings', () => {
  const output = probe(`
${warmPhaseFixture}
const mutations=[
 value=>value.sourceEvents.pop(),
 value=>value.sourceEvents.at(-1).type='RUN_ERROR',
 value=>delete value.sourceEvents.at(-1).outcome,
 value=>value.sourceEvents[0].runId='foreign-run',
 value=>value.publicState.threadId='foreign-thread',
 value=>value.publicState.events=[],
 value=>value.publicState.pendingInterrupts=null,
 value=>value.publicState.pendingInterrupts.interrupts[0].message='changed message',
 value=>value.publicState.pendingInterrupts.interrupts[0].responseSchema.properties.approved.type='string',
 value=>value.publicState.pendingInterrupts.interrupts[0].reason='changed-reason',
 value=>value.sourceEvents.at(-1).outcome.interrupts[0].extra='invented',
 value=>value.publicState.pendingInterrupts.interrupts[0].id='foreign-request',
 value=>value.sourceEvents.at(-1).outcome.interrupts.push(structuredClone(value.sourceEvents.at(-1).outcome.interrupts[0])),
 value=>value.sourceEvents.at(-1).outcome.pendingToolCallIds=['foreign-browser'],
 value=>value.publicState.pendingConversationRecovery={id:'invented-cold-token'},
 value=>changePayload(value,payload=>payload.expectedBrowserCallIds.push('foreign-browser')),
 value=>changePayload(value,payload=>payload.expectedBrowserCallIds.push(payload.expectedBrowserCallIds[0])),
 value=>changePayload(value,payload=>payload.approvals.pendingBatch.batch.protectedRequests[0].requestId='foreign-request'),
 value=>changePayload(value,payload=>payload.approvals.pendingBatch.batch.browserBindings[0].arguments.city='changed'),
 value=>changePayload(value,payload=>payload.approvals.pendingBatch.publicLocations['ficc_current-browser-1'].callIndex=1),
 value=>{value.after.attemptSequences.push(19);},
 value=>{value.after.entries.push({seq:20,receiptId:'ghost-receipt',correlation:'Owned current city',canonicalCallId:'current-browser-1'});value.after.attemptSequences.push(19);value.after.computations++;},
 value=>value.after.entries[0].canonicalCallId='current-browser-1',
];
for(const mutate of mutations){const changed=phaseFacts(true);mutate(changed);assert.throws(()=>subject.classifyCandidateWarmPhase(changed),/phase|browser|interrupt|source|terminal|identity|run|thread|member|payload|binding|batch|entry|witness|pending|canonical|location|attempt|cold|equal|provider/i);}
const empty=phaseFacts(false);empty.after.entries=structuredClone(empty.before.entries);empty.after.attemptSequences=[...empty.before.attemptSequences];empty.after.computations=empty.before.computations;
assert.throws(()=>subject.classifyCandidateWarmPhase(empty),/entered|browser|witness|phase/i);
`);

  expect(output.trim()).toBe('passed');
});

test('warm entered phase validates current deltas without dropping historical provider effect or observer facts', () => {
  const output = probe(`
${warmPhaseFixture}
const original=phaseFacts(false);assert.equal(subject.classifyCandidateWarmPhase(original),'entered-browser-handler');
const mutations=[value=>value.after.providerRequests.push({body:{unexpected:true}}),value=>value.after.providerRequests[0].body.historical='edited',value=>value.after.effects.push({id:2,call_id:'unexpected-native'}),value=>value.after.effects=[],value=>value.after.nativeWitnesses.push({callId:'current-protected-1',runId:'original-run'}),value=>value.after.entries[0].receiptId='edited-history',value=>value.after.attemptSequences.push(21),value=>value.after.computations++,value=>value.savedSession.state='Owned',value=>value.expected.threadId='wrong-thread'];
for(const mutate of mutations){const changed=phaseFacts(false);mutate(changed);assert.throws(()=>subject.classifyCandidateWarmPhase(changed),/phase|provider|history|effect|native|entry|attempt|comput|thread|Ready|state|equal|preserv/i);}
`);

  expect(output.trim()).toBe('passed');
});

test('saved pending browser membership accepts new history IDs and refuses filtering foreign missing duplicated or already answered authority', () => {
  const output = probe(`
${warmPhaseFixture}
const facts=phaseFacts(false);const payload=JSON.parse(facts.savedSession.payload);const request=JSON.parse(payload.publicRequest);const call=request.messages.at(-1).toolCalls[0];call.id='history-observed-browser';payload.expectedBrowserCallIds=[call.id];payload.publicRequest=JSON.stringify(request);
assert.deepEqual(subject.readCandidatePendingBrowserCalls(JSON.stringify(payload)),[call]);
const variants=[value=>value.expectedBrowserCallIds.push('foreign'),value=>value.expectedBrowserCallIds=[],value=>value.expectedBrowserCallIds.push(value.expectedBrowserCallIds[0]),value=>{const raw=JSON.parse(value.publicRequest);raw.messages.push({id:'answered-result',role:'tool',toolCallId:call.id,content:'already answered'});value.publicRequest=JSON.stringify(raw);},value=>{const raw=JSON.parse(value.publicRequest);raw.messages.at(-1).toolCalls[0].function.name='unregistered-browser';value.publicRequest=JSON.stringify(raw);}];
for(const mutate of variants){const changed=structuredClone(payload);mutate(changed);assert.throws(()=>subject.readCandidatePendingBrowserCalls(JSON.stringify(changed)),/pending|browser|canonical|identity|call|equal|unresolved|declar/i);}
`);

  expect(output.trim()).toBe('passed');
});

test('entered warm phase requires one distinct actual correlation per current browser even when receipt and attempt totals match', () => {
  const output = probe(`
${warmPhaseFixture}
const facts=phaseFacts(false);
const second={id:'current-browser-2',name:'getWeather',arguments:{city:'Second owned current city'},correlation:'Second owned current city'};
facts.expected.browsers.push(second);
changePayload(facts,payload=>{const request=JSON.parse(payload.publicRequest);request.messages.at(-1).toolCalls.push({id:second.id,type:'function',function:{name:second.name,arguments:JSON.stringify(second.arguments)}});payload.publicRequest=JSON.stringify(request);payload.expectedBrowserCallIds.push(second.id);});
facts.sourceEvents.splice(facts.sourceEvents.length-1,0,{type:'TOOL_CALL_START',toolCallId:second.id,toolCallName:second.name,parentMessageId:'current-parent'});
facts.after.entries.push({seq:24,receiptId:'second-current-receipt',correlation:second.correlation,toolName:second.name,arguments:second.arguments,result:'Second declared known'});facts.after.attemptSequences.push(23,25);facts.after.holdReceiptIds.push('second-current-receipt');facts.after.computations++;
assert.equal(subject.classifyCandidateWarmPhase(facts),'entered-browser-handler');
const changed=structuredClone(facts);const secondSequence=changed.after.entries[2].seq;
changed.after.entries[2]={...structuredClone(changed.after.entries[1]),seq:secondSequence,receiptId:'distinct-second-receipt-for-first-browser'};
changed.after.holdReceiptIds[2]=changed.after.entries[2].receiptId;
assert.deepEqual([...changed.after.holdReceiptIds.slice(changed.before.holdReceiptIds.length)].sort(),changed.after.entries.slice(changed.before.entries.length).map(entry=>entry.receiptId).sort());
assert.equal(changed.after.entries.length,facts.after.entries.length);assert.equal(new Set(changed.after.entries.map(entry=>entry.receiptId)).size,changed.after.entries.length);assert.deepEqual(changed.after.attemptSequences,facts.after.attemptSequences);assert.equal(changed.after.computations,facts.after.computations);
assert.throws(()=>subject.classifyCandidateWarmPhase(changed),/correlation|browser|coverage|entry|witness|distinct|equal/i);
`);

  expect(output.trim()).toBe('passed');
});

test('warm publication requires normalized saved history without an injected foreign runId while source and public run remain current', () => {
  const output = probe(`
${warmPhaseFixture}
const original=phaseFacts(true);
assert.equal(Object.hasOwn(JSON.parse(JSON.parse(original.savedSession.payload).publicRequest),'runId'),false,'NativeSessionHistory.Normalize removes runId from stored canonical history');
assert.equal(subject.classifyCandidateWarmPhase(original),'paused-for-protected-interrupt');
const changed=structuredClone(original);changePayload(changed,payload=>{const request=JSON.parse(payload.publicRequest);request.runId='foreign-injected-run';payload.publicRequest=JSON.stringify(request);});
assert.deepEqual(changed.sourceEvents,original.sourceEvents);assert.deepEqual(changed.publicState,original.publicState);assert.deepEqual(changed.expected,original.expected);
assert.throws(()=>subject.classifyCandidateWarmPhase(changed),/canonical|normal|runId|saved|history|unexpected|absen/i);
`);

  expect(output.trim()).toBe('passed');
});

test('warm source parents follow actual native unanchored fallback without inventing or ignoring a text anchor', () => {
  const result = probe(`
${warmPhaseFixture}
const original=phaseFacts(true);
for(const event of original.sourceEvents)if(event.type==='TOOL_CALL_START')delete event.parentMessageId;
changePayload(original,payload=>{
 const request=JSON.parse(payload.publicRequest);const announcement=request.messages.pop();
 for(const call of announcement.toolCalls)request.messages.push({id:'assistant-'+call.id,role:'assistant',content:'',toolCalls:[call]});
 payload.publicRequest=JSON.stringify(request);
 const saved=payload.approvals.pendingBatch;
 saved.publicLocations['ficc_current-browser-1']={assistantMessageId:'assistant-current-browser-1',messageIndex:4,callIndex:0};
 saved.publicLocations['ficc_current-protected-1']={assistantMessageId:'assistant-current-protected-1',messageIndex:5,callIndex:0};
 for(const item of [...saved.batch.protectedRequests,...saved.batch.browserBindings])item.nativeLocation.messageId=null;
});

assert.equal(subject.classifyCandidateWarmPhase(original),'paused-for-protected-interrupt');
const mutations=[
 value=>changePayload(value,payload=>{const request=JSON.parse(payload.publicRequest);request.messages[4].id='invented-parent';payload.publicRequest=JSON.stringify(request);payload.approvals.pendingBatch.publicLocations['ficc_current-browser-1'].assistantMessageId='invented-parent';}),
 value=>{value.sourceEvents[1].parentMessageId='wrong-explicit-parent';},
 value=>{value.sourceEvents.splice(1,0,{type:'TEXT_MESSAGE_START',messageId:'real-active-parent',role:'assistant'},{type:'TEXT_MESSAGE_END',messageId:'real-active-parent'});},
];
for(const mutate of mutations){const changed=structuredClone(original);mutate(changed);assert.throws(()=>subject.classifyCandidateWarmPhase(changed),/parent|source|canonical|location|equal/i);}
`);

  expect(result).toContain('passed');
});

test('warm entered observer accounting requires exact entry and hold receipt pairs while paused phases add neither request domain', () => {
  const output = probe(`
${warmPhaseFixture}
const entered=phaseFacts(false);
assert.equal(entered.after.attemptSequences.length-entered.before.attemptSequences.length,2);
assert.equal(subject.classifyCandidateWarmPhase(entered),'entered-browser-handler');
const mutations=[
 value=>value.after.holdReceiptIds.pop(),
 value=>value.after.holdReceiptIds[1]='foreign-hold-receipt',
 value=>value.after.holdReceiptIds.push('current-receipt'),
 value=>value.after.holdReceiptIds[0]='edited-history-hold',
 value=>value.after.attemptSequences.push(23),
 value=>value.after.attemptSequences.pop(),
 value=>{value.after.entries.push({...value.after.entries[1],seq:24,receiptId:'duplicate-dispatch-receipt'});value.after.attemptSequences.push(23,25);value.after.holdReceiptIds.push('duplicate-dispatch-receipt');value.after.computations++;},
];
for(const mutate of mutations){const changed=structuredClone(entered);mutate(changed);assert.throws(()=>subject.classifyCandidateWarmPhase(changed),/hold|receipt|entry|witness|attempt|browser|histor|preserv|equal|coverage/i);}
const paused=phaseFacts(true);
assert.equal(subject.classifyCandidateWarmPhase(paused),'paused-for-protected-interrupt');
for(const mutate of [value=>value.after.holdReceiptIds.push('unentered-receipt'),value=>value.after.holdReceiptIds[0]='edited-history-hold',value=>value.after.attemptSequences.push(19),value=>value.after.computations++]){const changed=structuredClone(paused);mutate(changed);assert.throws(()=>subject.classifyCandidateWarmPhase(changed),/hold|receipt|attempt|comput|histor|preserv|equal|paused/i);}
`);

  expect(output.trim()).toBe('passed');
});
