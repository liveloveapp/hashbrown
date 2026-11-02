import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const acceptanceUrl = pathToFileURL(
  resolve(__dirname, '../harness/candidate-browser-acceptance.ts'),
).href;

test('unknown-effect local claim accepts both actual ACK timings while requiring retired inert SDK state and original pending identity', () => {
  const output = probe(`
const runId='actual-current-run';
function facts(){const pending={id:'actual-old-token',serverRevision:6,toolCalls:[{id:'current-browser-1',name:'getWeather',arguments:{city:'Owned current city 1'}}],interrupts:[{id:'ficc_current-protected-1',reason:'tool_call',message:'Approval required for tool call: lookupAirport',toolCallId:'current-protected-1',responseSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved']}}]};return {runId,originalPending:pending,status:{pending:structuredClone(pending),recovery:{required:true},isLoading:false,isResuming:false,events:[],transport:[{kind:'started',requestId:runId},{kind:'error',requestId:runId},{kind:'disposed',requestId:runId}]}};}

subject.assertCandidateUnknownEffectLocalState(facts());
for(const kind of ['aborted','deadline']){const value=facts();value.status.transport.splice(1,0,{kind,requestId:runId,abortSource:kind==='deadline'?'deadline':'caller'});subject.assertCandidateUnknownEffectLocalState(value);}
const acked=facts();acked.status.events.push({type:'RUN_STARTED',runId,requestId:runId});acked.status.pending=null;subject.assertCandidateUnknownEffectLocalState(acked);
for(const original of [facts(),structuredClone(acked)]){
 const completed=structuredClone(original);completed.status.transport=[{kind:'started',requestId:runId},{kind:'disposed',requestId:runId},{kind:'complete',requestId:runId}];
 subject.assertCandidateUnknownEffectLocalState(completed);
 for(const mutate of [value=>value.status.transport=[{kind:'started',requestId:runId},{kind:'complete',requestId:runId},{kind:'disposed',requestId:runId}],value=>value.status.transport.push({kind:'complete',requestId:runId}),value=>value.status.transport.push({kind:'disposed',requestId:runId}),value=>value.status.transport[2].requestId='foreign-completion',value=>value.status.transport[1].requestId='foreign-disposal',value=>value.status.transport=value.status.transport.filter(record=>record.kind!=='complete'),value=>value.status.transport=value.status.transport.filter(record=>record.kind!=='disposed')]){const changed=structuredClone(completed);mutate(changed);assert.throws(()=>subject.assertCandidateUnknownEffectLocalState(changed),/complet|dispos|lifecycle|request|settle|retir|order|equal/i);}
}
const mutations=[
 value=>value.status.recovery.required=false,
 value=>value.status.isLoading=true,
 value=>value.status.isResuming=true,
 value=>value.status.transport=value.status.transport.filter(record=>record.kind!=='disposed'),
 value=>value.status.transport[2].requestId='foreign-request',
 value=>value.status.transport=value.status.transport.filter(record=>record.kind!=='error'),
 value=>value.status.pending.id='changed-pending-token',
 value=>value.status.pending.toolCalls[0].arguments.city='changed arguments',
 value=>value.status.pending.interrupts=[],
 value=>value.originalPending.id='changed-original-token',
 value=>value.status.pending=null,
];
for(const mutate of mutations){const value=facts();mutate(value);assert.throws(()=>subject.assertCandidateUnknownEffectLocalState(value),/unknown|ACK|ack|requir|idle|load|resum|dispos|retir|lifecycle|pending|original|identity|error|settle|equal/i);}
for(const mutate of [value=>value.status.events.push({...value.status.events[0]}),value=>value.status.events[0].requestId='foreign-request',value=>value.status.events[0].runId='foreign-run',value=>value.status.pending=structuredClone(value.originalPending)]){const value=structuredClone(acked);mutate(value);assert.throws(()=>subject.assertCandidateUnknownEffectLocalState(value),/ACK|ack|identity|request|run|pending|equal/i);}
`);

  expect(output.trim()).toBe('passed');
});

test('maintained expiry requires exact empty410 joined to the retired purged lineage and one inert status read', () => {
  const output = probe(`
function facts(){
 const published={session:{id:'actual-session',selector:'actual-thread',agent:'HashbrownNative',scope:'alice',state:'Ready',revision:40,generation:4,ever_saved:true,payload:JSON.stringify({formatVersion:2,nativeJson:'{}',publicRequest:'{}',pendingCalls:[],expectedBrowserCallIds:['browser']}),token:null,lease_until:null,admitted_request:null,expires_at:'2030-01-01T00:00:00Z'},members:[{session_id:'actual-session',batch_id:'actual-batch',call_id:'browser',request_id:'ficc_browser',kind:'BrowserBypass',state:'Pending',captured_generation:4,private_descriptor:'owned browser descriptor',admitted_generation:null,admitted_revision:null,result_digest:null},{session_id:'actual-session',batch_id:'actual-batch',call_id:'protected',request_id:'ficc_protected',kind:'Protected',state:'Pending',captured_generation:4,private_descriptor:'owned protected descriptor',admitted_generation:null,admitted_revision:null,result_digest:null}],batches:[{session_id:'actual-session',batch_id:'actual-batch',state:'Pending',member_count:2,published_revision:38,admitted_generation:null,admitted_revision:null}],invocations:[{session_id:'actual-session',call_id:'protected',state:'Captured',captured_generation:4,descriptor:'owned invocation descriptor',dispatch_generation:null}],effects:[]};
 const state=structuredClone(published);Object.assign(state.session,{state:'Retired',revision:41,generation:5,payload:null,expires_at:'2000-01-01T00:00:00Z'});for(const row of state.members){row.state='Retired';row.private_descriptor=null;}for(const row of state.batches)row.state='Retired';for(const row of state.invocations)row.descriptor=null;
 const before={state,runs:[{proxyId:'actual-original-run',input:{threadId:'actual-thread',runId:'actual-public-run'}}],providerCount:1,counts:{'Run.Forward':1,'maintenance-call':1},observerAttempts:[]};
 const after=structuredClone(before);after.counts['status-read']=1;
 return {response:{status:410,body:null,bodyText:'',bodyBase64:''},publishedState:published,before,after,beforeWitnesses:[],afterWitnesses:[],controls:[{name:'expire-native-payload',method:'POST',status:200,bodyText:''},{name:'maintain-native',method:'POST',status:200,bodyText:'{"count":1}'}],publicState:{pending:null,localError:'Error: Recovery read failed: 410',error:null}};
}
const original=facts();

subject.assertCandidateExpiredRead(original);
const mutations=[
 value=>{value.response.status=200;value.response.body={schemaVersion:2,disposition:'Expired',serverRevision:41};},
 value=>value.response.status=503,
 value=>value.response.body={},
 value=>value.response.bodyText='non-JSON entity hidden by parser',
 value=>value.response.bodyBase64='eA==',
 value=>value.publicState.pending={id:'invented',toolCalls:[]},
 value=>{value.publicState.localError=null;value.publicState.error=null;},
 value=>value.controls.pop(),
 value=>value.controls[0].status=500,
 value=>value.controls[1].bodyText='{"count":0}',
 value=>value.publishedState.session.state='Blocked',
 value=>{value.before.state.session.revision=40;value.after.state.session.revision=40;},
 value=>{value.before.state.session.generation=4;value.after.state.session.generation=4;},
 value=>{value.before.state.session.id='foreign';value.after.state.session.id='foreign';},
 value=>{value.before.state.session.expires_at='2030-01-01T00:00:00Z';value.after.state.session.expires_at='2030-01-01T00:00:00Z';},
 value=>{value.before.state.session.state='Expired';value.after.state.session.state='Expired';},
 ...['payload','token','lease_until','admitted_request'].map(key=>value=>{value.before.state.session[key]='unpurged';value.after.state.session[key]='unpurged';}),
 value=>{value.before.state.members[0].private_descriptor='unpurged';value.after.state.members[0].private_descriptor='unpurged';},
 value=>{value.before.state.members[0].state='Pending';value.after.state.members[0].state='Pending';},
 value=>{value.before.state.members.pop();value.after.state.members.pop();},
 value=>{value.before.state.batches[0].state='Pending';value.after.state.batches[0].state='Pending';},
 value=>{value.before.state.invocations[0].descriptor='unpurged';value.after.state.invocations[0].descriptor='unpurged';},
 value=>value.after.state.effects.push({call_id:'unexpected'}),
 value=>value.after.providerCount++,
 value=>value.after.runs.push({proxyId:'unexpected'}),
 value=>value.after.observerAttempts.push(9),
 value=>value.after.counts['status-read']=2,
 value=>delete value.after.counts['status-read'],
 value=>value.after.counts['Acquire.Start']=1,
 value=>value.after.counts['Deserialize.Forward']=1,
 value=>value.after.counts['cold-acquire-success']=1,
 value=>value.afterWitnesses.push({callId:'unexpected',domain:'handler-return'}),
];
for(const mutate of mutations){const changed=facts();mutate(changed);assert.throws(()=>subject.assertCandidateExpiredRead(changed),/410|empty|body|entity|capab|pending|error|expir|retir|purge|lineage|identity|session|member|batch|descriptor|control|maint|status|read|count|stage|state|physical|provider|run|observer|witness|generation|revision|equal/i);}
`);

  expect(output.trim()).toBe('passed');
});

test('malformed HTTP completion requires an actual complete entity while aborted readiness waits for its asynchronous fault receipt', () => {
  const output = probe(`
const {isCandidateMalformedBoundaryReady:ready,assertCandidateProxyIntervention:check}=subject;
const requestId='actual-proxy-request',runId='actual-public-run',threadId='actual-thread';
const frame=value=>Buffer.from('data: '+JSON.stringify(value)+String.fromCharCode(10,10));
const ack=frame({type:'RUN_STARTED',threadId,runId});const result=frame({type:'TOOL_CALL_RESULT',toolCallId:'protected',content:'native original'});const finish=frame({type:'RUN_FINISHED',threadId,runId});const post=Buffer.concat([result,finish]);const corrupt=Buffer.from(post);corrupt[6]=33;
const record=(seq,kind,extra={})=>({seq,kind,requestId,bytes:Buffer.alloc(0),...extra});
const original={scenario:'failure.malformed-ack',requestId,runId,threadId,error:{name:'SyntaxError',message:'Actual malformed JSON'},recoveryRequired:true,records:[record(31,'request'),record(32,'upstream-headers',{status:200}),record(33,'upstream-body',{bytes:ack}),record(34,'upstream-ack'),record(35,'delivered-headers',{status:200}),record(36,'delivered-body',{bytes:ack}),record(37,'downstream-ack-write'),record(38,'upstream-body',{bytes:post}),record(39,'mutation',{reason:'malform-after-upstream-ack'}),record(40,'delivered-body',{bytes:corrupt}),record(41,'complete')],events:[{type:'RUN_STARTED',runId,requestId:runId,monotonicMs:516.7}],transport:[{kind:'started',requestId:runId,monotonicMs:340.4},{kind:'error',requestId:runId,monotonicMs:633.1},{kind:'disposed',requestId:runId,monotonicMs:633.2}]};
const copy=()=>({...structuredClone(original),records:original.records.map(value=>({...value,bytes:Buffer.from(value.bytes)}))});
const replacePost=(value,bytes)=>{value.records.find(record=>record.seq===38).bytes=Buffer.from(bytes);const changed=Buffer.from(bytes);changed[6]=33;value.records.find(record=>record.seq===40).bytes=changed;};

assert.equal(ready(original.records,requestId),true,'Actual normal HTTP EOF must unblock malformed validation');
check(original);
assert.equal(ready([],requestId),false);assert.equal(ready(original.records,'foreign'),false);
const closed=original.records.filter(record=>record.kind!=='complete').concat(record(41,'downstream-closed'));
assert.equal(ready(closed,requestId),false,'Closure alone precedes asynchronous upstream fault recording');
assert.equal(ready([...closed,record(42,'fault',{reason:'aborted'})],requestId),true);
check({...original,records:[...closed,record(42,'fault',{reason:'aborted'})]});
assert.equal(ready([...closed,record(42,'fault',{reason:'unexpected infrastructure failure'})],requestId),true,'Readiness never classifies a fault as acceptable');
const mutations=[
 value=>value.records=value.records.filter(record=>record.kind!=='complete'),
 value=>value.records.push(record(42,'complete')),
 value=>value.records.find(record=>record.kind==='complete').seq=38,
 value=>value.records.push(record(42,'downstream-closed')),
 value=>value.records.push(record(42,'fault',{reason:'aborted'})),
 value=>replacePost(value,result),
 value=>replacePost(value,Buffer.concat([result,frame({type:'RUN_FINISHED',threadId,runId:'foreign'})])),
 value=>replacePost(value,Buffer.concat([result,frame({type:'RUN_FINISHED',threadId:'foreign',runId})])),
 value=>replacePost(value,Buffer.concat([result,frame({type:'RUN_ERROR',threadId,runId})])),
 value=>replacePost(value,Buffer.concat([result,finish,finish])),
 value=>{const row=value.records.find(record=>record.seq===40);row.bytes=row.bytes.subarray(0,row.bytes.length-4);},
 value=>value.records.push(record(42,'upstream-body',{bytes:finish})),
 value=>value.records.push(record(42,'delivered-body',{bytes:finish})),
 value=>{value.records.find(record=>record.seq===40).bytes[7]=33;},
 value=>delete value.error,
 value=>value.recoveryRequired=false,
 value=>value.transport[1].requestId='foreign',
 value=>value.transport=value.transport.filter(record=>record.kind!=='disposed'),
];
for(const mutate of mutations){const value=copy();mutate(value);assert.throws(()=>check(value),/complete|terminal|entity|byte|source|fault|close|malform|mutat|deliver|parser|Syntax|error|dispos|request|run|thread|requir|seq|order|late|equal/i);}
`);

  expect(output.trim()).toBe('passed');
});

test('inert snapshot comparison still rejects journal provider run or observer changes independently of status-read accounting', () => {
  const output = probe(`
const before={state:{session:{state:'Ready',revision:6,generation:1},effects:[],members:[]},runs:[{proxyId:'original',input:{runId:'original-run'}}],providerCount:1,counts:{'status-read':1,'Run.Forward':1},observerAttempts:[]};

subject.assertCandidateUnchangedSnapshot(before,structuredClone(before));
for(const mutate of [value=>value.state.session.revision++,value=>value.state.session.generation++,value=>value.state.session.state='Blocked',value=>value.state.effects.push({call_id:'unexpected'}),value=>value.state.members.push({call_id:'unexpected'}),value=>value.providerCount++,value=>value.runs.push({proxyId:'unexpected'}),value=>value.observerAttempts.push(99),value=>value.counts['Run.Forward']++]){const changed=structuredClone(before);mutate(changed);assert.throws(()=>subject.assertCandidateUnchangedSnapshot(before,changed),/inert|operation|physical|state|provider|run|observer|count|stage|equal/i);}
`);

  expect(output.trim()).toBe('passed');
});

test('explicit reconciliation status read permits exactly one named counter increment and preserves every other stage key', () => {
  const output = probe(`
const check=subject.assertCandidateStageCounts;
const before={'status-read':1,'Run.Forward':1,'cold-acquire-success':0,'reservation-success':0,'Native.Result.Observed':0};
const after={...before,'status-read':2};

check(before,after,1);
check(before,{...before});
check({},{});
check({}, {'status-read':1},1);
assert.throws(()=>check(before,after),/count|stage|read|equal/i);
for(const changed of [{...before},{...after,'status-read':3},{...after,'status-read':0},{...after,'Run.Forward':2},{...after,'cold-acquire-success':1},{...after,'reservation-success':1},{...after,'Native.Result.Observed':1},{...after,'unexpected-zero-stage':0},{'status-read':2}])assert.throws(()=>check(before,changed,1),/count|stage|read|equal/i);
assert.throws(()=>check({}, {'status-read':0}),/count|stage|read|equal/i);
for(const delta of [-1,2,0.5,NaN,Infinity,'1',null])assert.throws(()=>check(before,{...before},delta),/delta|status|read|count|stage/i);
assert.deepEqual(before,{'status-read':1,'Run.Forward':1,'cold-acquire-success':0,'reservation-success':0,'Native.Result.Observed':0});
`);

  expect(output.trim()).toBe('passed');
});

test('retained malformed proof preserves original parser facts but validates every later ACK and lifecycle observation without rollback', () => {
  const output = probe(`
const {assertCandidateProxyIntervention:check,refreshCandidateFaultObservation:refresh}=subject;
const requestId='actual-proxy-request',runId='actual-public-run';
const frame=value=>Buffer.from('data: '+JSON.stringify(value)+String.fromCharCode(10,10));
const ack=frame({type:'RUN_STARTED',threadId:'actual-thread',runId});const result=frame({type:'TOOL_CALL_RESULT',toolCallId:'protected',content:'native original'});const changed=Buffer.from(result);changed[6]=33;
const record=(seq,kind,extra={})=>({seq,kind,requestId,bytes:Buffer.alloc(0),...extra});
const records=[record(35,'upstream-body',{bytes:ack}),record(36,'upstream-ack'),record(38,'delivered-body',{bytes:ack}),record(39,'downstream-ack-write'),record(40,'upstream-body',{bytes:result}),record(41,'mutation',{reason:'malform-after-upstream-ack'}),record(42,'delivered-body',{bytes:changed}),record(43,'downstream-closed'),record(44,'fault',{reason:'aborted'})];
const original={scenario:'failure.malformed-ack',requestId,runId,error:{name:'SyntaxError',message:'Actual malformed JSON'},recoveryRequired:true,events:[{type:'RUN_STARTED',runId,requestId:runId,monotonicMs:494.7}],transport:[{kind:'started',requestId:runId,monotonicMs:326.2},{kind:'error',requestId:runId,monotonicMs:507.2},{kind:'disposed',requestId:runId,monotonicMs:507.3}]};
check({...original,records});
const duplicateAck={events:[...original.events,{...original.events[0],monotonicMs:508}],transport:[...original.transport],error:null,recoveryRequired:false};

assert.throws(()=>check({...refresh(original,duplicateAck),records}),/ACK|ack|consum|equal/i);
for(const kind of ['error','disposed']){const latest={events:[...original.events],transport:[...original.transport,{kind,requestId:runId,monotonicMs:508}],error:null,recoveryRequired:false};assert.throws(()=>check({...refresh(original,latest),records}),/error|dispos|lifecycle|request|equal/i);}
const latest={events:[...original.events,{type:'RUN_STARTED',runId:'unrelated-run',requestId:'unrelated-run',monotonicMs:600}],transport:[...original.transport,{kind:'started',requestId:'unrelated-run',monotonicMs:590}],error:null,recoveryRequired:false};
const combined=refresh(original,latest);check({...combined,records});assert.deepEqual(combined.events,latest.events);assert.deepEqual(combined.transport,latest.transport);assert.deepEqual(combined.error,original.error);assert.equal(combined.recoveryRequired,true);assert.notEqual(combined.events,original.events);
for(const changed of [{events:[],transport:original.transport},{events:[{...original.events[0],monotonicMs:493}],transport:original.transport},{events:original.events,transport:original.transport.slice(1)},{events:original.events,transport:original.transport.map((value,index)=>index===0?{...value,requestId:'edited-original-request'}:value)}])assert.throws(()=>refresh(original,changed),/prefix|rollback|drop|original|preserv|equal/i);
`);

  expect(output.trim()).toBe('passed');
});

test('malformed continuation permits only proven same-request decoder teardown after exact corrupt delivery and downstream close', () => {
  const output = probe(`
const check=subject.assertCandidateProxyIntervention;
const requestId='actual-proxy-request',runId='actual-public-run';
const frame=value=>Buffer.from('data: '+JSON.stringify(value)+String.fromCharCode(10,10));
const ack=frame({type:'RUN_STARTED',threadId:'actual-thread',runId});
const result=frame({type:'TOOL_CALL_RESULT',toolCallId:'protected',content:'{"code":"PDX"}'});
const changed=Buffer.from(result);changed[6]=33;
const record=(seq,kind,extra={})=>({seq,kind,requestId,bytes:Buffer.alloc(0),...extra});
const original={scenario:'failure.malformed-ack',requestId,runId,error:{name:'SyntaxError',message:'Unexpected token ! in actual source JSON'},recoveryRequired:true,records:[record(33,'request'),record(34,'upstream-headers',{status:200}),record(35,'upstream-body',{bytes:ack}),record(36,'upstream-ack'),record(37,'delivered-headers',{status:200}),record(38,'delivered-body',{bytes:ack}),record(39,'downstream-ack-write'),record(40,'upstream-body',{bytes:result}),record(41,'mutation',{reason:'malform-after-upstream-ack'}),record(42,'delivered-body',{bytes:changed}),record(43,'downstream-closed'),record(44,'fault',{reason:'aborted'})],events:[{type:'RUN_STARTED',runId,requestId:runId,monotonicMs:494.7}],transport:[{kind:'started',requestId:runId,monotonicMs:326.2},{kind:'error',requestId:runId,monotonicMs:507.2},{kind:'disposed',requestId:runId,monotonicMs:507.3}]};
const copy=()=>({...structuredClone(original),records:original.records.map(value=>({...value,bytes:Buffer.from(value.bytes)}))});

check(original);
check({...original,error:'SyntaxError: Unexpected token ! in actual source JSON'});
const mutations=[
 value=>delete value.error,
 value=>value.error={name:'TypeError',message:'unrelated infrastructure failure'},
 value=>value.error='Unrelated message containing SyntaxError',
 value=>value.recoveryRequired=false,
 value=>value.transport[1].requestId='foreign-public-run',
 value=>value.events[0].requestId='foreign-public-run',
 value=>value.transport[2].monotonicMs=500,
 value=>value.transport[1].monotonicMs=490,
 value=>value.transport=value.transport.filter(item=>item.kind!=='error'),
 value=>value.transport=value.transport.filter(item=>item.kind!=='disposed'),
 value=>value.transport.push({kind:'error',requestId:runId,monotonicMs:507.25}),
 value=>value.transport.push({kind:'disposed',requestId:runId,monotonicMs:507.4}),
 value=>value.transport.push({kind:'aborted',requestId:runId,abortSource:'caller',monotonicMs:507.1}),
 value=>value.transport.push({kind:'deadline',requestId:runId,abortSource:'deadline',monotonicMs:507.1}),
 value=>value.transport.push({kind:'complete',requestId:runId,monotonicMs:507.4}),
 value=>value.records=value.records.filter(item=>item.kind!=='downstream-closed'),
 value=>{value.records.find(item=>item.kind==='fault').seq=42;},
 value=>{value.records.find(item=>item.kind==='downstream-closed').seq=41;},
 value=>value.records.push(record(45,'fault',{reason:'aborted'})),
 value=>value.records.push(record(45,'upstream-body',{bytes:frame({type:'RUN_FINISHED',threadId:'actual-thread',runId})})),
 value=>value.records.push(record(45,'delivered-body',{bytes:Buffer.from('late')})),
 value=>{value.records.find(item=>item.kind==='fault').reason='Response byte limit';},
 value=>{value.records.find(item=>item.kind==='upstream-body').seq=NaN;},
 value=>value.requestId='foreign-proxy-request',
 value=>value.scenario='failure.ack-disconnect',
 value=>{value.records.find(item=>item.kind==='mutation').reason='another-mutation';},
 value=>value.records=value.records.filter(item=>item.kind!=='mutation'),
 value=>{value.records.find(item=>item.seq===42).bytes=Buffer.from(result);},
 value=>{const bytes=value.records.find(item=>item.seq===42).bytes;bytes[bytes.length-3]=33;},
 value=>{value.records.find(item=>item.seq===38).bytes=Buffer.from('data: {}'+String.fromCharCode(10,10));},
 value=>{value.records.find(item=>item.seq===40).bytes=Buffer.from(changed);},
];
for(const mutate of mutations){const value=copy();mutate(value);assert.throws(()=>check(value),/fault|abort|source|ACK|ack|malform|mutat|byte|deliver|parser|Syntax|error|dispos|request|run|scope|requir|seq|order|close|late|equal|causal/i);}
`);

  expect(output.trim()).toBe('passed');
});

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
let sequence=0;const record=(kind,extra={})=>({seq:++sequence,kind,requestId:'actual-request',bytes:Buffer.alloc(0),...extra});
const frame=value=>'data: '+JSON.stringify(value)+String.fromCharCode(10,10);
const source=Buffer.from(frame({type:'RUN_STARTED',threadId:'actual-thread',runId:'actual-run'})+frame({type:'TEXT_MESSAGE_START',messageId:'m'})+frame({type:'RUN_FINISHED',threadId:'actual-thread',runId:'actual-run'}));
const delivered=Buffer.from(source.toString().replace('{"type":"TEXT_MESSAGE_START"','!"type":"TEXT_MESSAGE_START"'));
const mode='malform-after-upstream-ack';
const good={scenario:'failure.malformed-ack',requestId:'actual-request',runId:'actual-run',threadId:'actual-thread',error:{name:'SyntaxError',message:'Actual malformed JSON'},recoveryRequired:true,records:[record('upstream-body',{bytes:source}),record('upstream-ack'),record('downstream-ack-write'),record('mutation',{reason:mode}),record('delivered-body',{bytes:delivered}),record('complete')],events:[{type:'RUN_STARTED',runId:'actual-run',requestId:'actual-run',monotonicMs:2}],transport:[{kind:'started',requestId:'actual-run',monotonicMs:1},{kind:'error',requestId:'actual-run',monotonicMs:3},{kind:'disposed',requestId:'actual-run',monotonicMs:4}]};
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

const ordinaryThreadFixture = String.raw`
function ordinaryThreadFacts(facade='completion', api='chat-completions') {
 const completion=facade.endsWith('completion');
 const oldThread='retained-thread', freshThread=completion?'explicit-fresh-thread':oldThread;
 const oldMessages=[{id:'system',role:'system',content:'trusted system'},{id:'prior-user',role:'user',content:'original input'},{id:'call-parent',role:'assistant',content:'',toolCalls:[{id:'old-browser',type:'function',function:{name:'getWeather',arguments:'{"city":"owned"}'}}]},{id:'old-result',role:'tool',toolCallId:'old-browser',content:'known old result'},{id:'old-answer',role:'assistant',content:'Candidate complete'}];
 const configuration={system:'trusted system',tools:[{name:'getWeather',description:'Weather',parameters:{type:'object',properties:{city:{type:'string'}},required:['city'],additionalProperties:false}}],forwardedProps:{}};
 if(facade.startsWith('structured-'))configuration.forwardedProps={hashbrown:{responseSchema:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false}}};
 if(facade.startsWith('ui-'))configuration.forwardedProps={hashbrown:{responseSchema:{type:'object',properties:{ui:{type:'array',items:{type:'object',properties:{CandidateCard:{type:'object',properties:{props:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}},required:['props'],additionalProperties:false}},required:['CandidateCard'],additionalProperties:false}}},required:['ui'],additionalProperties:false}}};
 if(facade.startsWith('structured-'))oldMessages.at(-1).content=JSON.stringify({answer:'Candidate complete'});
 if(facade.startsWith('ui-'))oldMessages.at(-1).content=JSON.stringify({ui:[{CandidateCard:{props:{text:'Candidate complete'}}}]});
 const prompt='Ordinary retained-thread';
 const replacement=[structuredClone(oldMessages[0]),{id:'ordinary-user',role:'user',content:prompt}];
 const input=(threadId,runId,messages)=>({threadId,runId,messages:structuredClone(messages),tools:structuredClone(configuration.tools),context:[],state:null,forwardedProps:structuredClone(configuration.forwardedProps)});
 const oldRequest=input(oldThread,'old-run',oldMessages);delete oldRequest.runId;
 const state=(threadId,request)=>({session:{id:threadId+'-key',selector:threadId,state:'Ready',revision:8,generation:2,ever_saved:true,token:null,lease_until:null,admitted_request:null,payload:JSON.stringify({formatVersion:2,nativeJson:'{"stateBag":{}}',publicRequest:JSON.stringify(request),pendingCalls:[],expectedBrowserCallIds:[],turnCompleted:true,approvals:{pendingBatch:null}})},invocations:[],batches:[],members:[],effects:[]});
 const originalState=state(oldThread,oldRequest);
 const observer={records:[{seq:1,kind:'request-received',threadId:oldThread},{seq:2,kind:'entry-committed',threadId:oldThread,receiptId:'observed-old-receipt'},{seq:3,kind:'request-received',threadId:oldThread},{seq:4,kind:'hold-received',threadId:oldThread,receiptId:'observed-old-receipt'}],entries:[{receiptId:'observed-old-receipt',canonicalCallId:'old-browser',correlation:'owned',toolName:'getWeather',arguments:{city:'owned'},result:'known old result'}],attemptSequences:[1,3],holdReceiptIds:['observed-old-receipt'],computations:1};
 const oldRuns=[{requestId:'old-original-proxy',input:{...structuredClone(oldRequest),runId:'old-original-run'},status:200},{requestId:'old-recovery-proxy',input:{...structuredClone(oldRequest),runId:'old-recovery-run'},status:200}];
 const witnesses=[{seq:1,threadId:oldThread,callId:'historic-protected',domain:'native-outward-before-public-project',value:'historic-result'}];
 const baseline={state:originalState,witnesses,observer,runs:oldRuns,providerCount:2,proxyRejections:[],counts:{"Transport.Typed.Before":2,"Recovery.Provider.Projected":1,"Serialize.Forward":2,"Executable.Typed.Admitted":1,"Deserialize.Forward":1,"Transport.Typed.Admitted":1,"Original.Typed.After":2,"Serialize.Guard":2,"Original.Raw.Before":2,"Transport.Independent":2,"Create.Completed":1,"Acquire.Start":2,"cold-acquire-attempt":1,"Context.Disposed":2,"Deserialize.Completed":1,"Create.Forward":1,"Store.Key":2,"Serialize.Completed":2,"Original.Typed.Before":2,"Transport.Typed.After":2,"Run.Guard":2,"Acquire.Completed":2,"Run.Forward":2,"Deserialize.Guard":1,"Original.Typed.AfterPrepare":2,"Public.Admitted":1,"save-success":2,"Original.Raw.After":2,"status-read":3,"Create.Guard":1,"cold-acquire-success":1}};
 const rejectedInput=input(oldThread,'replacement-rejected-run',replacement);
 const rejectedRun={requestId:'rejected-proxy',input:rejectedInput,status:400};
 const rejected={request:rejectedRun,receipt:{requestId:'rejected-proxy',upstreamStatus:400,deliveredStatus:400,bodyText:'',bodyBase64:'',sourceEvents:[],deliveredEvents:[],requestSeq:10,headersSeq:11,completeSeq:12,monotonicMs:12},publicState:{threadId:oldThread,pending:null,isLoading:false,isResuming:false,error:{name:'TransportError',message:'Bad Request (400)'},recovery:{required:false},output:null,localError:null,lastAction:'next',events:[],transport:[{kind:'started',requestId:rejectedInput.runId},{kind:'error',requestId:rejectedInput.runId},{kind:'disposed',requestId:rejectedInput.runId}]},after:{...structuredClone(baseline),runs:[...structuredClone(oldRuns),rejectedRun]}};
 if(completion)for(const stage of ["Original.Raw.Before","Original.Typed.Before","Transport.Independent","Transport.Typed.Before","Original.Typed.AfterPrepare","Store.Key","Acquire.Start","Acquire.Completed","Original.Raw.After","Original.Typed.After","Transport.Typed.After","Context.Disposed"])rejected.after.counts[stage]=(rejected.after.counts[stage]??0)+1;
 const newInput=input(freshThread,'ordinary-accepted-run',completion?replacement:[...oldMessages,{id:'ordinary-user',role:'user',content:prompt}]);
 if(completion)newInput.messages[0].id='fresh-configured-system';
 const answer=facade.startsWith('structured-')?JSON.stringify({answer:'Ordinary complete'}):facade.startsWith('ui-')?JSON.stringify({ui:[{CandidateCard:{props:{text:'Ordinary complete'}}}]}):'Ordinary complete';
 const events=[{type:'RUN_STARTED',threadId:freshThread,runId:newInput.runId},{type:'TEXT_MESSAGE_START',messageId:'ordinary-answer',role:'assistant'},{type:'TEXT_MESSAGE_CONTENT',messageId:'ordinary-answer',delta:answer},{type:'TEXT_MESSAGE_END',messageId:'ordinary-answer'},{type:'RUN_FINISHED',threadId:freshThread,runId:newInput.runId}];
 const saved={...structuredClone(newInput),messages:[...structuredClone(newInput.messages),{id:'ordinary-answer',role:'assistant',content:answer}]};delete saved.runId;
 const provider=api==='responses'?{input:newInput.messages.map(({role,content})=>({role,content:[{type:role==='assistant'?'output_text':'input_text',text:content}]}))}:{messages:newInput.messages.map(({role,content,toolCalls,toolCallId})=>({role,content,...(toolCalls?{tool_calls:toolCalls}:{}),...(toolCallId?{tool_call_id:toolCallId}:{})}))};
 const schema=configuration.forwardedProps.hashbrown?.responseSchema;
 if(schema){if(api==='responses')provider.text={format:{type:'json_schema',name:'hashbrown',schema,strict:true}};else provider.response_format={type:'json_schema',json_schema:{name:'hashbrown',schema,strict:true}};}
 const run={requestId:'accepted-proxy',input:newInput,status:200};
 const navigation=completion?{control:'new-thread',fromThreadId:oldThread,toThreadId:freshThread,startedMs:20,completedMs:21,beforeUrl:'http://127.0.0.1:4401/?config='+encodeURIComponent(JSON.stringify({facade,threadId:oldThread,nextPrompt:prompt,observer:{entryUrl:'http://127.0.0.1:4402/owned-old-entry',holdBaseUrl:'http://127.0.0.1:4402/owned-old-hold'}})),afterUrl:'http://127.0.0.1:4401/?config='+encodeURIComponent(JSON.stringify({facade,threadId:freshThread,nextPrompt:prompt,observer:{entryUrl:'http://127.0.0.1:4402/owned-old-entry',holdBaseUrl:'http://127.0.0.1:4402/owned-old-hold'}})),status:{facade,threadId:freshThread,pending:null,pendingInterrupts:null,output:null,isLoading:false,isResuming:false,recovery:{required:false},events:[],transport:[]},runs:structuredClone(rejected.after.runs),providerCount:2}:undefined;
 const accepted={request:run,receipt:{requestId:'accepted-proxy',upstreamStatus:200,deliveredStatus:200,requestSeq:30,headersSeq:31,completeSeq:37,monotonicMs:30,sourceEvents:events,deliveredEvents:structuredClone(events)},publicState:{threadId:freshThread,pending:null,isLoading:false,isResuming:false,error:null,recovery:{required:false},events:[{type:'RUN_STARTED',runId:newInput.runId,requestId:newInput.runId},{type:'RUN_FINISHED',runId:newInput.runId,requestId:newInput.runId}],transport:[{kind:'started',requestId:newInput.runId},{kind:'disposed',requestId:newInput.runId},{kind:'complete',requestId:newInput.runId}],output:facade.startsWith('structured-')?{answer:'Ordinary complete'}:facade.startsWith('ui-')?{ui:[{CandidateCard:{props:{text:'Ordinary complete'}}}]}:'Ordinary complete'},provider,newState:state(freshThread,saved),newWitnesses:[],after:{...structuredClone(baseline),runs:completion?structuredClone(rejected.after.runs):[...structuredClone(oldRuns),run],providerCount:3}};
 if(completion){accepted.newRuns=[structuredClone(run)];accepted.currentProviderCount=accepted.after.providerCount;accepted.after.counts=structuredClone(rejected.after.counts);for(const stage of ['Create.Forward','Create.Completed','Run.Forward','Serialize.Forward','Serialize.Completed','save-success'])accepted.after.counts[stage]=(accepted.after.counts[stage]??0)+1;}
 if(!completion){accepted.publicState.messages=[...structuredClone(newInput.messages),{id:'ordinary-answer',role:'assistant',content:facade.startsWith('structured-')||facade.startsWith('ui-')?JSON.parse(answer):answer}];delete accepted.publicState.output;}
 if(facade==='ui-completion'){accepted.publicState.output={id:'ordinary-answer',role:'assistant',content:JSON.parse(answer)};accepted.publicState.rawOutput=JSON.parse(answer);accepted.renderedText=['Ordinary complete'];}
 if(facade==='ui-chat')accepted.renderedText=['Ordinary complete'];
 return {facade,api,configuration,prompt,baseline,...(completion?{rejected,navigation}:{}),accepted};
}
`;

test('ordinary completion qualification joins genuine same-thread refusal explicit navigation and fresh accepted prediction across all completion facades and APIs', () => {
  const output = probe(`
${ordinaryThreadFixture}
for(const facade of ['completion','structured-completion','ui-completion'])for(const api of ['chat-completions','responses']){
 const value=ordinaryThreadFacts(facade,api);
 subject.assertCandidateOrdinaryThreadQualification(value);
 const disposed=structuredClone(value);disposed.accepted.publicState.transport.pop();subject.assertCandidateOrdinaryThreadQualification(disposed);
 const angular=structuredClone(value);angular.rejected.publicState.error='TransportError: Bad Request (400)';subject.assertCandidateOrdinaryThreadQualification(angular);
 subject.assertCandidateFacadeSchema(facade,api,value.configuration,[value.accepted.provider]);
 subject.assertCandidateProviderTextHistory(value.accepted.provider,api,value.accepted.request.input.messages);
}
`);

  expect(output.trim()).toBe('passed');
});

test('completion ordinary receipt guards reject altered refusal bytes HTTP source public identities and evidence order', () => {
  const output = probe(`
${ordinaryThreadFixture}
subject.assertCandidateOrdinaryThreadQualification(ordinaryThreadFacts());
const mutations=[
 value=>delete value.rejected,
 value=>value.rejected.request.input.threadId='foreign-thread',
 value=>value.rejected.receipt.requestId='foreign-proxy',
 value=>value.rejected.receipt.upstreamStatus=200,
 value=>value.rejected.receipt.deliveredStatus=409,
 value=>value.rejected.receipt.bodyText='not empty',
 value=>value.rejected.receipt.bodyBase64='eA==',
 value=>value.rejected.receipt.sourceEvents.push({type:'RUN_STARTED',threadId:'retained-thread',runId:'replacement-rejected-run'}),
 value=>value.rejected.receipt.deliveredEvents.push({type:'RUN_STARTED',threadId:'retained-thread',runId:'replacement-rejected-run'}),
 value=>value.rejected.publicState.events.push({type:'RUN_STARTED',runId:'replacement-rejected-run',requestId:'replacement-rejected-run'}),
 value=>value.rejected.publicState.error=null,
 value=>value.rejected.publicState.isLoading=true,
 value=>value.rejected.publicState.transport[1].requestId='foreign-run',
 value=>value.rejected.request.input.messages.push({id:'extra',role:'user',content:'injected'}),
 value=>value.rejected.request.input.forwardedProps={hashbrown:{recovery:{version:1,serverRevision:8,outcomes:[]}}},
 value=>value.rejected.request.input.resume=[],
 value=>value.navigation.startedMs=11,
 value=>value.accepted.receipt.monotonicMs=19,
 value=>value.rejected.receipt.completeSeq=value.rejected.receipt.requestSeq,
 value=>delete value.rejected.receipt.completeSeq,
 value=>value.rejected.request.input.tools=[],
 value=>value.rejected.request.input.messages[0].content='changed trusted system',
];
for(const mutate of mutations){const value=ordinaryThreadFacts();mutate(value);assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(value));}
`);

  expect(output.trim()).toBe('passed');
});

test('completion explicit new-thread qualification retains original authority counters and witnesses while requiring genuine fresh saved execution', () => {
  const output = probe(`
${ordinaryThreadFixture}
subject.assertCandidateOrdinaryThreadQualification(ordinaryThreadFacts());
const mutations=[
 value=>delete value.navigation,
 value=>value.navigation.control='automatic-rewrite',
 value=>value.navigation.toThreadId='retained-thread',
 value=>value.navigation.fromThreadId='foreign-thread',
 value=>value.navigation.afterUrl='http://127.0.0.1:9999/?config=fresh',
 value=>value.navigation.status.pending={id:'old-token'},
 value=>value.navigation.status.recovery.required=true,
 value=>value.navigation.providerCount++,
 value=>{const url=new URL(value.navigation.afterUrl);const config=JSON.parse(url.searchParams.get('config'));config.observer.entryUrl='http://127.0.0.1:4402/foreign-handler';url.searchParams.set('config',JSON.stringify(config));value.navigation.afterUrl=url.href;},
 value=>value.navigation.runs.push(structuredClone(value.rejected.request)),
 value=>value.rejected.after.providerCount++,
 value=>value.rejected.after.state.session.revision++,
 value=>value.rejected.after.state.session.generation++,
 value=>value.rejected.after.state.session.payload='changed canonical history',
 value=>value.rejected.after.state.effects.push({call_id:'old-browser'}),
 value=>value.rejected.after.witnesses=[],
 value=>value.rejected.after.observer.attemptSequences.push(4),
 value=>value.rejected.after.observer.records.push({seq:5,kind:'rejected',threadId:'explicit-fresh-thread',reason:'unknown scope'}),
 value=>value.rejected.after.runs.push(structuredClone(value.rejected.request)),
 value=>value.accepted.request.input.threadId='retained-thread',
 value=>value.accepted.request.input.runId=value.rejected.request.input.runId,
 value=>value.accepted.receipt.requestId=value.rejected.request.requestId,
 value=>value.accepted.receipt.deliveredStatus=400,
 value=>value.accepted.receipt.sourceEvents.pop(),
 value=>value.accepted.receipt.deliveredEvents.pop(),
 value=>value.accepted.request.input.forwardedProps={hashbrown:{recovery:{version:1}}},
 value=>value.accepted.request.input.resume=[],
 value=>value.accepted.request.input.messages[0].content='changed trusted system',
 value=>value.accepted.receipt.sourceEvents.at(-1).runId='foreign-run',
 value=>value.accepted.receipt.deliveredEvents.at(-1).threadId='foreign-thread',
 value=>value.accepted.publicState.events.push(structuredClone(value.accepted.publicState.events[0])),
 value=>value.accepted.publicState.events[1].requestId='foreign-request',
 value=>value.accepted.publicState.transport[2].requestId='foreign-request',
 value=>value.accepted.publicState.recovery.required=true,
 value=>value.accepted.publicState.output='wrong ordinary answer',
 value=>value.accepted.request.input.messages.splice(1,0,{id:'old-result',role:'tool',toolCallId:'old-browser',content:'known old result'}),
 value=>value.accepted.after.providerCount++,
 value=>value.accepted.after.state.session.revision++,
 value=>value.accepted.after.witnesses.push({callId:'replayed'}),
 value=>value.accepted.after.observer.computations++,
 value=>value.accepted.after.observer.records.push({seq:5,kind:'request-received',threadId:'explicit-fresh-thread'}),
 value=>value.accepted.after.runs=[],
 value=>value.accepted.newState.session.selector='retained-thread',
 value=>value.accepted.newState.session.state='Empty',
 value=>value.accepted.newState.session.ever_saved=false,
 value=>{const payload=JSON.parse(value.accepted.newState.session.payload);payload.turnCompleted=false;value.accepted.newState.session.payload=JSON.stringify(payload);},
 value=>{const payload=JSON.parse(value.accepted.newState.session.payload);payload.expectedBrowserCallIds=['old-browser'];value.accepted.newState.session.payload=JSON.stringify(payload);},
 value=>{const payload=JSON.parse(value.accepted.newState.session.payload);const request=JSON.parse(payload.publicRequest);request.messages[1].content='different saved input';payload.publicRequest=JSON.stringify(request);value.accepted.newState.session.payload=JSON.stringify(payload);},
 value=>value.accepted.newState.effects.push({call_id:'old-browser'}),
 value=>value.accepted.newWitnesses.push({callId:'replayed'}),
];
for(const mutate of mutations){const value=ordinaryThreadFacts();mutate(value);assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(value));}
for(const facade of ['structured-completion','ui-completion']){const value=ordinaryThreadFacts(facade);subject.assertCandidateOrdinaryThreadQualification(value);delete value.accepted.provider.response_format;assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(value));}
`);

  expect(output.trim()).toBe('passed');
});

test('chat ordinary qualification preserves same-thread canonical append and rejects completion-style replacement or navigation', () => {
  const output = probe(`
${ordinaryThreadFixture}
for(const facade of ['chat','structured-chat','ui-chat']){
 const value=ordinaryThreadFacts(facade);
 value.accepted.after.state=structuredClone(value.accepted.newState);
 subject.assertCandidateOrdinaryThreadQualification(value);
 for(const mutate of [v=>v.accepted.request.input.messages=v.accepted.request.input.messages.slice(-1),v=>v.accepted.request.input.threadId='unrequested-fresh-thread',v=>v.navigation={control:'new-thread',fromThreadId:'retained-thread',toThreadId:'fresh'},v=>v.rejected=ordinaryThreadFacts().rejected]){const changed=structuredClone(value);mutate(changed);assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(changed));}
}
`);

  expect(output.trim()).toBe('passed');
});

test('completion ordinary qualification retains the entire fresh-selector run set and current provider count through final drain', () => {
  const output = probe(`
${ordinaryThreadFixture}
function facts(){const value=ordinaryThreadFacts();value.accepted.newRuns=[structuredClone(value.accepted.request)];value.accepted.currentProviderCount=value.accepted.after.providerCount;return value;}
subject.assertCandidateOrdinaryThreadQualification(facts());
const mutations=[
 value=>value.accepted.newRuns.push(structuredClone(value.accepted.request)),
 value=>value.accepted.newRuns.push({requestId:'late-refused-proxy',input:{...structuredClone(value.accepted.request.input),runId:'late-refused-run'},status:400}),
 value=>value.accepted.newRuns=[{...structuredClone(value.accepted.request),input:{...structuredClone(value.accepted.request.input),threadId:'foreign-selector'}}],
 value=>value.accepted.newRuns=[{...structuredClone(value.accepted.request),requestId:'foreign-proxy'}],
 value=>value.accepted.newRuns=[],
 value=>value.accepted.currentProviderCount++,
];
for(const mutate of mutations){const value=facts();const beforeProviderCount=value.accepted.after.providerCount;mutate(value);assert.equal(value.accepted.after.providerCount,beforeProviderCount,'Late fresh HTTP membership can change without any provider or native work');assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(value));}
`);

  expect(output.trim()).toBe('passed');
});

test('ordinary thread qualification retains all global proxy refusals including unregistered attempts before final drain', () => {
  const output = probe(`
${ordinaryThreadFixture}
function facts(facade){
 const value=ordinaryThreadFacts(facade);
 if(!facade.endsWith('completion'))value.accepted.after.state=structuredClone(value.accepted.newState);
 const prior=[{seq:1,kind:'rejected',requestId:'prior-unregistered-request',scenarioId:'',threadId:'',workerId:'',routeEpoch:0,reason:'unregistered-route'}];
 value.baseline.proxyRejections=structuredClone(prior);
 if(value.rejected)value.rejected.after.proxyRejections=structuredClone(prior);
 value.accepted.after.proxyRejections=structuredClone(prior);
 return value;
}
const attempts=[
 {seq:100,kind:'rejected',requestId:'unregistered-request',scenarioId:'',threadId:'',workerId:'',routeEpoch:0,reason:'unregistered-thread-or-principal'},
 {seq:101,kind:'rejected',requestId:'foreign-principal-request',scenarioId:'',threadId:'',workerId:'',routeEpoch:0,reason:'unregistered-thread-or-principal'},
 {seq:102,kind:'rejected',requestId:'foreign-route-request',scenarioId:'',threadId:'',workerId:'',routeEpoch:0,reason:'unregistered-route'},
 {seq:103,kind:'rejected',requestId:'invalid-body-request',scenarioId:'',threadId:'',workerId:'',routeEpoch:0,reason:'invalid-request-json'},
];
for(const event of attempts)Object.assign(event,{monotonicMs:event.seq,bytes:Buffer.alloc(0),incomingBody:Buffer.alloc(0),forwardedBody:Buffer.alloc(0)});
for(const facade of ['chat','structured-chat','ui-chat','completion','structured-completion','ui-completion']){
 subject.assertCandidateOrdinaryThreadQualification(facts(facade));
 for(const attempt of attempts){
  const value=facts(facade);
  const originalRuns=structuredClone(value.accepted.after.runs);
  const providerCount=value.accepted.after.providerCount;
  const nativeState=structuredClone(value.accepted.after.state);
  const observer=structuredClone(value.accepted.after.observer);
  value.accepted.after.proxyRejections.push(structuredClone(attempt));
  assert.deepEqual(value.accepted.after.runs,originalRuns);assert.equal(value.accepted.after.providerCount,providerCount);assert.deepEqual(value.accepted.after.state,nativeState);assert.deepEqual(value.accepted.after.observer,observer);
  assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(value));
  if(facade.endsWith('completion')){const beforeNavigation=facts(facade);beforeNavigation.rejected.after.proxyRejections.push(structuredClone(attempt));assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(beforeNavigation));}
 }
 const edited=facts(facade);edited.accepted.after.proxyRejections[0].reason='edited retained refusal';assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(edited));
 const missing=facts(facade);missing.accepted.after.proxyRejections=[];assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(missing));
}
`);

  expect(output.trim()).toBe('passed');
});

test('ordinary final-drain refresh reads live membership and provider facts when its callback executes without rebasing captured authority', () => {
  const output = probe(`
${ordinaryThreadFixture}
function facts(facade){const value=ordinaryThreadFacts(facade);if(!facade.endsWith('completion'))value.accepted.after.state=structuredClone(value.accepted.newState);return value;}
for(const facade of ['chat','structured-chat','ui-chat','completion','structured-completion','ui-completion']){
 const original=facts(facade);
 subject.assertCandidateOrdinaryThreadQualification(original);
 const preserved=structuredClone(original);
 let current={runs:structuredClone(original.accepted.after.runs),providerCount:original.accepted.after.providerCount,proxyRejections:structuredClone(original.accepted.after.proxyRejections),...(facade.endsWith('completion')?{newRuns:structuredClone(original.accepted.newRuns)}:{})};
 let reads=0;
 const finalize=()=>{const refreshed=subject.refreshCandidateOrdinaryThreadQualification(original,()=>{reads++;return current;});subject.assertCandidateOrdinaryThreadQualification(refreshed);return refreshed;};
 assert.equal(reads,0,'Creating the finalizer must not snapshot future evidence');
 const refreshed=finalize();assert.equal(reads,1);assert.deepEqual(original,preserved,'Refresh must preserve original baseline and captured protocol/native facts');assert.deepEqual(refreshed,original);
 const mutations=[
 value=>value.runs.push({requestId:'late-chat-refused-proxy',input:{...structuredClone(original.accepted.request.input),threadId:original.baseline.state.session.selector,runId:'late-chat-refused-run'},status:400}),
 value=>value.providerCount++,
 value=>value.proxyRejections.push({seq:500,kind:'rejected',requestId:'late-global-refusal',scenarioId:'',threadId:'',workerId:'',routeEpoch:0,reason:'unregistered-thread-or-principal'}),
 ];
 if(facade.endsWith('completion'))mutations.push(value=>value.newRuns.push({requestId:'late-fresh-refused-proxy',input:{...structuredClone(original.accepted.request.input),runId:'late-fresh-refused-run'},status:400}));
 for(const mutate of mutations){
  current={runs:structuredClone(original.accepted.after.runs),providerCount:original.accepted.after.providerCount,proxyRejections:structuredClone(original.accepted.after.proxyRejections),...(facade.endsWith('completion')?{newRuns:structuredClone(original.accepted.newRuns)}:{})};
  mutate(current);
  assert.throws(()=>finalize());
  assert.deepEqual(original,preserved,'Late live changes must not be hidden by mutating or rebasing the original record');
 }
}
`);

  expect(output.trim()).toBe('passed');
});

test('completion same-selector refusal permits outer attempt diagnostics but forbids native execution reservation recovery and save counter changes', () => {
  const output = probe(`
${ordinaryThreadFixture}
const actualCompletedCounts={"Transport.Typed.Before":2,"Recovery.Provider.Projected":1,"Serialize.Forward":2,"Executable.Typed.Admitted":1,"Deserialize.Forward":1,"Transport.Typed.Admitted":1,"Original.Typed.After":2,"Serialize.Guard":2,"Original.Raw.Before":2,"Transport.Independent":2,"Create.Completed":1,"Acquire.Start":2,"cold-acquire-attempt":1,"Context.Disposed":2,"Deserialize.Completed":1,"Create.Forward":1,"Store.Key":2,"Serialize.Completed":2,"Original.Typed.Before":2,"Transport.Typed.After":2,"Run.Guard":2,"Acquire.Completed":2,"Run.Forward":2,"Deserialize.Guard":1,"Original.Typed.AfterPrepare":2,"Public.Admitted":1,"save-success":2,"Original.Raw.After":2,"status-read":1,"Create.Guard":1,"cold-acquire-success":1};
const allowedOuter=['Original.Raw.Before','Original.Typed.Before','Transport.Independent','Transport.Typed.Before','Original.Typed.AfterPrepare','Store.Key','Acquire.Start','Acquire.Completed','Original.Raw.After','Original.Typed.After','Transport.Typed.After','Context.Disposed'];
const forbidden=['Create.Forward','Create.Completed','Deserialize.Forward','Deserialize.Completed','Run.Forward','Serialize.Forward','Serialize.Completed','Evidence.Start','Reserve.Start','Reserve.Committed','Admission.Completed','Executable.Typed.Admitted','Transport.Typed.Admitted','Public.Admitted','Recovery.Provider.Projected','Native.Result.Observed','reservation-attempt','reservation-success','cold-acquire-attempt','cold-acquire-success','save-success'];
for(const facade of ['completion','structured-completion','ui-completion']){
 const original=ordinaryThreadFacts(facade);
 original.baseline.counts=structuredClone(actualCompletedCounts);
 original.rejected.after.counts=structuredClone(actualCompletedCounts);
 for(const stage of allowedOuter)original.rejected.after.counts[stage]=(original.rejected.after.counts[stage]??0)+1;
 original.rejected.after.counts['status-read']+=2;
 original.accepted.after.counts=structuredClone(original.rejected.after.counts);
 for(const stage of ['Create.Forward','Create.Completed','Run.Forward','Serialize.Forward','Serialize.Completed','save-success'])original.accepted.after.counts[stage]=(original.accepted.after.counts[stage]??0)+1;
 subject.assertCandidateOrdinaryThreadQualification(original);
 for(const invalid of [-1,0.5,Number.MAX_SAFE_INTEGER+1,NaN,Infinity,'1',null])for(const where of ['baseline','refused']){const changed=structuredClone(original);const counts=where==='baseline'?changed.baseline.counts:changed.rejected.after.counts;counts['Acquire.Start']=invalid;assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(changed));}
 for(const where of ['baseline','refused']){const changed=structuredClone(original);if(where==='baseline')delete changed.baseline.counts;else delete changed.rejected.after.counts;assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(changed));}
 for(const stage of forbidden){
  const changed=structuredClone(original);
  changed.rejected.after.counts[stage]=(changed.rejected.after.counts[stage]??0)+1;
  assert.deepEqual(changed.rejected.after.state,original.rejected.after.state);assert.equal(changed.rejected.after.providerCount,original.rejected.after.providerCount);assert.deepEqual(changed.rejected.after.witnesses,original.rejected.after.witnesses);assert.deepEqual(changed.rejected.after.observer,original.rejected.after.observer);
  assert.throws(()=>subject.assertCandidateOrdinaryThreadQualification(changed),undefined,'Forbidden native execution counter delta must not disappear: '+stage);
 }
}
`);

  expect(output.trim()).toBe('passed');
});
