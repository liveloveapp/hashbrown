import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const subjectUrl = pathToFileURL(
  resolve(__dirname, '../candidate-consumer/ci.mjs'),
).href;

/** Runs CI policy in native ESM with real owned temporary files; receipts remain unit fixtures, never browser authority. */
function probe(body: string, timeout = 20_000): string {
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
import crypto from 'node:crypto';
const subject = await import(${JSON.stringify(subjectUrl)});
const root = await fs.realpath(await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'candidate-ci-unit-')));
try {
${body}
} finally { await fs.rm(root, {recursive:true,force:true}); }
console.log('passed');`,
    ],
    { encoding: 'utf8', timeout },
  );
}

test('candidate CI plan requires fresh distinct absolute pointers and exact sequential bounded targets', () => {
  const result = probe(`
const npm=path.join(root,'npm.json'), nuget=path.join(root,'nuget.json');
const plan=subject.candidateCiPlan(npm,nuget);
assert.deepEqual(plan.map(phase=>phase.name),['npm','nuget','isolation','browser']);
assert.deepEqual(plan.map(phase=>phase.command),['npx','npx','npx','npx']);
assert.deepEqual(plan.map(phase=>phase.args),[
 ['nx','prepare-candidate-npm','dotnet-conformance','--','--metadata='+npm],
 ['nx','prepare-candidate-nuget','dotnet-conformance','--','--metadata='+nuget],
 ['nx','candidate-consumer-check','dotnet-conformance','--','--npm-metadata='+npm,'--metadata='+nuget],
 ['nx','candidate-recovery-browser','dotnet-conformance','--','--npm-metadata='+npm,'--metadata='+nuget],
]);
assert.deepEqual(plan.map(phase=>phase.timeoutMs),[600000,600000,600000,14400000]);
assert.equal(plan.reduce((sum,phase)=>sum+phase.timeoutMs,0),270*60000);
assert.throws(()=>subject.candidateCiPlan(npm,npm),/distinct|pointer/i);
assert.throws(()=>subject.candidateCiPlan('relative.json',nuget),/absolute|pointer/i);
assert.throws(()=>subject.candidateCiPlan(npm,path.join(root,'..','outside.json')+'/../nuget.json'),/normal|pointer|path/i);
assert.ok(Object.isFrozen(plan));
for(const phase of plan){ assert.ok(Object.isFrozen(phase));assert.ok(Object.isFrozen(phase.args)); }
`);

  expect(result.trim()).toBe('passed');
});

test('candidate CI accepts only actual complete isolation20 and exact all372 receipts', () => {
  const result = probe(`
const {candidateBrowserManifest}=await import(${JSON.stringify(pathToFileURL(resolve(__dirname, '../harness/candidate-browser-manifest.ts')).href)});
const ids=candidateBrowserManifest('all').map(record=>record.id);
assert.equal(ids.length,372);
const isolationIds=['actual-candidate-public-contracts','old-public-missing-api.core','old-public-missing-api.react','old-public-missing-api.angular','missing-archive-with-usable-cache','archive-tamper','archive-symlink','workspace-path-alias','consumer-source-symlink','installed-sdk-symlink','added-consumer-source','added-consumer-root.unreviewed.ts','added-consumer-root.tsconfig.extra.json','added-consumer-root..npmrc','owned-npm-config-tamper','added-producer-source','descriptor-tamper','metadata-source-hash-tamper','nuget-role-substitution.library','nuget-role-substitution.executable'];
// Exact actual check.mjs vocabulary; no generated receipt is claimed as executed isolation.
const isolation={kind:'source-candidate-isolation',schema:1,records:isolationIds.map(id=>({id,status:'passed'})),nugetRestoreNegative:{status:'rejected'}};
const browser={kind:'source-candidate-browser',mode:'all',manifest:ids.map(id=>({id})),outcomes:ids.map(id=>({id,status:'passed'})),validation:{passed:true,missingIds:[],unexpectedIds:[],duplicateIds:[],failedIds:[],skippedIds:[]},faults:[],overallStatus:'passed'};
subject.validateCandidateCiReceipts({isolation,browser});
for(const changed of [ {...browser,mode:'pilot'}, {...browser,outcomes:browser.outcomes.slice(1)}, {...browser,outcomes:[...browser.outcomes,browser.outcomes[0]]}, {...browser,outcomes:browser.outcomes.map((item,index)=>index===0?{...item,status:'skipped'}:item)}, {...browser,outcomes:[...browser.outcomes.slice(1),{id:'invented',status:'passed'}]}, {...browser,faults:['actual reporter fault']}, {...browser,overallStatus:'failed'} ]) assert.throws(()=>subject.validateCandidateCiReceipts({isolation,browser:changed}),/manifest|mode|result|outcome|fault|passed|372|identity/i);
for(const changed of [{...isolation,records:isolation.records.slice(1)}, {...isolation,records:[...isolation.records.slice(1),{id:'invented-isolation',status:'passed'}]}, {...isolation,records:isolation.records.map((item,index)=>index===0?{...item,status:'failed'}:item)}]) assert.throws(()=>subject.validateCandidateCiReceipts({isolation:changed,browser}),/isolation|record|20|passed|identity/i);
`);

  expect(result.trim()).toBe('passed');
});

test('candidate CI exporter copies only fixed real evidence bytes and rejects cache, aliases and path escapes', () => {
  const result = probe(`
const owned=path.join(root,'owned'); await fs.mkdir(owned);
const browser=path.join(owned,'hashbrown-candidate-all-unit'); await fs.mkdir(browser);
await fs.writeFile(path.join(browser,'manifest.json'),'actual manifest bytes');
await fs.writeFile(path.join(browser,'outcomes.json'),'actual outcome bytes');
const output=path.join(root,'artifact');
const copied=await subject.exportCandidateCiEvidence({ownedRoot:owned,outputDirectory:output,selections:[{kind:'browser',root:browser}]});
assert.equal(await fs.readFile(path.join(output,'browser','manifest.json'),'utf8'),'actual manifest bytes');
assert.ok(copied.some(file=>file.sha256===crypto.createHash('sha256').update('actual manifest bytes').digest('hex')));
const outside=path.join(root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'manifest.json'),'foreign');
await assert.rejects(()=>subject.exportCandidateCiEvidence({ownedRoot:owned,outputDirectory:path.join(root,'escape'),selections:[{kind:'browser',root:outside}]}),/owned|outside|contain|path/i);
await fs.symlink(outside,path.join(owned,'alias'));
await assert.rejects(()=>subject.exportCandidateCiEvidence({ownedRoot:owned,outputDirectory:path.join(root,'alias-output'),selections:[{kind:'browser',root:path.join(owned,'alias')}]}),/alias|symlink|physical/i);
for(const forbidden of ['.env','npm-cache/secret.json','home/key.json','node_modules/package.json','arbitrary.json']){
 const file=path.join(browser,forbidden);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'never upload');
 const destination=path.join(root,'forbidden-'+crypto.randomUUID());
 await assert.rejects(()=>subject.exportCandidateCiEvidence({ownedRoot:owned,outputDirectory:destination,selections:[{kind:'browser',root:browser}]}),/allow|unexpected|forbid|evidence/i);
 await fs.rm(file); if(forbidden.includes('/')) await fs.rm(path.dirname(file),{recursive:true,force:true});
}
await assert.rejects(()=>subject.exportCandidateCiEvidence({ownedRoot:owned,outputDirectory:path.join(root,'capped'),selections:[{kind:'browser',root:browser}],maxFileBytes:3,maxTotalBytes:100}),/bound|limit|bytes/i);
await assert.rejects(()=>subject.exportCandidateCiEvidence({ownedRoot:owned,outputDirectory:path.join(root,'total-capped'),selections:[{kind:'browser',root:browser}],maxFileBytes:100,maxTotalBytes:10}),/bound|limit|bytes/i);
`);

  expect(result.trim()).toBe('passed');
});

test('candidate CI stops after first actual phase failure and preserves errors across evidence export and owned cleanup', () => {
  const result = probe(`
const calls=[]; const phaseError=new Error('actual preparation failure'); const exportError=new Error('actual evidence copy failure'); const cleanupError=new Error('actual cleanup failure');
let context;
await assert.rejects(()=>subject.runCandidateCi({evidenceDirectory:path.join(root,'result')},{
 executePhase:async(phase,current)=>{context=current;calls.push(phase.name);assert.ok(path.isAbsolute(current.ownedRoot));assert.equal(current.environment.TMPDIR,current.ownedRoot);assert.notEqual(current.npmPointer,current.nugetPointer);throw phaseError;},
 exportEvidence:async(current)=>{assert.equal(current,context);calls.push('export');throw exportError;},
 cleanup:async(current)=>{assert.equal(current,context);calls.push('cleanup');await fs.rm(current.ownedRoot,{recursive:true,force:true});throw cleanupError;},
}),error=>{assert.ok(error instanceof AggregateError);assert.ok(error.errors.includes(phaseError));assert.ok(error.errors.includes(exportError));assert.ok(error.errors.includes(cleanupError));return true;});
assert.deepEqual(calls,['npm','export','cleanup']);
const summary=JSON.parse(await fs.readFile(path.join(root,'result','ci-summary.json'),'utf8'));
assert.equal(summary.status,'failed');assert.equal(summary.phases.length,1);assert.notEqual(summary.phases[0].status,0);
assert.equal(await fs.stat(context.ownedRoot).then(()=>true,()=>false),false);
`);

  expect(result.trim()).toBe('passed');
});

test('candidate CI owns actual SIGINT and SIGTERM through pending export and exact-root cleanup', () => {
  const result = probe(
    `
const {spawn}=await import('node:child_process');
const childMain=async function(){
 const fs=await import('node:fs/promises');const path=await import('node:path');
 const {runCandidateCi}=await import(process.env.UNIT_CI_MODULE);
 try {await runCandidateCi({evidenceDirectory:process.env.UNIT_OUTPUT},{
  executePhase:async()=>{throw new Error('controlled preparation failure');},
  exportEvidence:async context=>{await fs.writeFile(process.env.UNIT_READY,JSON.stringify({ownedRoot:context.ownedRoot}));await new Promise(resolve=>setTimeout(resolve,1000));await fs.writeFile(process.env.UNIT_EXPORTED,'actual export completed');return [];},
  cleanup:async context=>{await fs.rm(context.ownedRoot,{recursive:true,force:true});await fs.writeFile(process.env.UNIT_CLEANED,'actual cleanup completed');},
 });throw new Error('Cancelled CI accepted');}
 catch(error){if(!(error instanceof AggregateError)||!error.errors.some(item=>String(item.message).includes(process.env.UNIT_SIGNAL)))throw error;}
};
for(const signal of ['SIGINT','SIGTERM']){
 const ready=path.join(root,signal+'-ready.json'),output=path.join(root,signal+'-output'),exported=path.join(root,signal+'-exported'),cleaned=path.join(root,signal+'-cleaned');
 const child=spawn(process.execPath,['--input-type=module','-e','('+childMain.toString()+')()'],{env:{PATH:process.env.PATH,UNIT_CI_MODULE:${JSON.stringify(subjectUrl)},UNIT_READY:ready,UNIT_OUTPUT:output,UNIT_EXPORTED:exported,UNIT_CLEANED:cleaned,UNIT_SIGNAL:signal},stdio:['ignore','pipe','pipe']});
 let diagnostics='';child.stdout.on('data',bytes=>diagnostics+=bytes);child.stderr.on('data',bytes=>diagnostics+=bytes);
 const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,reason)=>resolve({code,reason}));});
 let receipt;
 try{
  const deadline=performance.now()+5000;
  while(!receipt&&performance.now()<deadline){try{receipt=JSON.parse(await fs.readFile(ready,'utf8'));}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}if(!receipt)await new Promise(resolve=>setTimeout(resolve,10));}
  assert.ok(receipt,'Actual pending export readiness required');
  child.kill(signal);
  const outcome=await closed;assert.equal(outcome.code,0,diagnostics||'Orchestration died before finalization on '+signal);
  assert.equal(await fs.readFile(exported,'utf8'),'actual export completed');assert.equal(await fs.readFile(cleaned,'utf8'),'actual cleanup completed');
  assert.equal(await fs.stat(receipt.ownedRoot).then(()=>true,()=>false),false);
  const summary=JSON.parse(await fs.readFile(path.join(output,'ci-summary.json'),'utf8'));assert.equal(summary.status,'failed');assert.ok(summary.errors.some(error=>error.includes(signal)));
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed;if(receipt)await fs.rm(receipt.ownedRoot,{recursive:true,force:true});}
}
`,
    30_000,
  );

  expect(result.trim()).toBe('passed');
}, 40_000);

test('candidate CI cannot call a complete outcome ID list successful without required supporting evidence', () => {
  const result = probe(`
const {candidateBrowserManifest}=await import(${JSON.stringify(pathToFileURL(resolve(__dirname, '../harness/candidate-browser-manifest.ts')).href)});
const manifest=candidateBrowserManifest('all');
const isolationIds=['actual-candidate-public-contracts','old-public-missing-api.core','old-public-missing-api.react','old-public-missing-api.angular','missing-archive-with-usable-cache','archive-tamper','archive-symlink','workspace-path-alias','consumer-source-symlink','installed-sdk-symlink','added-consumer-source','added-consumer-root.unreviewed.ts','added-consumer-root.tsconfig.extra.json','added-consumer-root..npmrc','owned-npm-config-tamper','added-producer-source','descriptor-tamper','metadata-source-hash-tamper','nuget-role-substitution.library','nuget-role-substitution.executable'];
// Actual filesystem receipt fixtures test retention policy; they do not claim provider/browser execution.
let owned;
await assert.rejects(()=>subject.runCandidateCi({evidenceDirectory:path.join(root,'missing-facts')},{executePhase:async(phase,context)=>{
 owned=context.ownedRoot;
 if(phase.name==='isolation'){const directory=path.join(owned,'hashbrown-candidate-isolation-unit');await fs.mkdir(directory);await fs.writeFile(path.join(directory,'isolation-evidence.json'),JSON.stringify({kind:'source-candidate-isolation',schema:1,records:isolationIds.map(id=>({id,status:'passed'})),nugetRestoreNegative:{status:'rejected'}}));}
 if(phase.name==='browser'){const directory=path.join(owned,'hashbrown-candidate-all-unit');await fs.mkdir(directory);await fs.writeFile(path.join(directory,'outcomes.json'),JSON.stringify({kind:'source-candidate-browser',mode:'all',manifest,outcomes:manifest.map(item=>({id:item.id,status:'passed'})),validation:{passed:true,missingIds:[],unexpectedIds:[],duplicateIds:[],failedIds:[],skippedIds:[]},faults:[],overallStatus:'passed'}));}
 return 0;
}}),/evidence|support|manifest|provenance|required|candidate CI/i);
assert.equal(await fs.stat(owned).then(()=>true,()=>false),false);
const summary=JSON.parse(await fs.readFile(path.join(root,'missing-facts','ci-summary.json'),'utf8'));assert.equal(summary.status,'failed');
`);

  expect(result.trim()).toBe('passed');
});

test('candidate CI export preserves later independent safe evidence after an earlier refusal', () => {
  const result = probe(`
const owned=path.join(root,'owned');await fs.mkdir(owned);
const browser=path.join(owned,'hashbrown-candidate-all-unit'),isolation=path.join(owned,'hashbrown-candidate-isolation-unit');await fs.mkdir(browser);await fs.mkdir(isolation);
await fs.writeFile(path.join(browser,'.env'),'must not export');
const raw='actual independent retained receipt';await fs.writeFile(path.join(isolation,'isolation-evidence.json'),raw);
const output=path.join(root,'artifact');
let caught;
try{await subject.exportCandidateCiEvidence({ownedRoot:owned,outputDirectory:output,selections:[{kind:'browser',root:browser},{kind:'isolation',root:isolation}]});}catch(error){caught=error;}
assert.ok(caught,'Forbidden earlier file must fail export');
assert.equal(await fs.readFile(path.join(output,'isolation','isolation-evidence.json'),'utf8'),raw,'Later independent evidence must survive an earlier export refusal');
assert.equal(await fs.stat(path.join(output,'browser','.env')).then(()=>true,()=>false),false);
assert.ok(caught instanceof AggregateError);assert.ok(caught.files.some(file=>file.file==='isolation/isolation-evidence.json'&&file.sha256===crypto.createHash('sha256').update(raw).digest('hex')),'Successful export hash inventory must survive aggregate failure');
`);

  expect(result.trim()).toBe('passed');
});

test('candidate CI producer logs use exact reviewed filenames rather than arbitrary log extensions', () => {
  const result = probe(`
for(const kind of ['npm','nuget']) for(const unknown of ['arbitrary.log','.env.log']){
 const owned=path.join(root,kind+unknown);await fs.mkdir(owned);
 const source=path.join(owned,kind==='npm'?'hashbrown-candidate-browser-unit':'hashbrown-nuget-consumer-unit');await fs.mkdir(path.join(source,'logs'),{recursive:true});
 await fs.writeFile(path.join(source,'logs','revision.log'),'known reviewed phase');await fs.writeFile(path.join(source,'logs',unknown),'never upload unreviewed log');
 const output=path.join(root,'artifact-'+crypto.randomUUID());
 await assert.rejects(()=>subject.exportCandidateCiEvidence({ownedRoot:owned,outputDirectory:output,selections:[{kind,root:source}]}),/allow|unexpected|review|evidence/i);
 assert.equal(await fs.stat(path.join(output,kind,'logs',unknown)).then(()=>true,()=>false),false);
 assert.equal(await fs.readFile(path.join(output,kind,'logs','revision.log'),'utf8'),'known reviewed phase');
}
`);

  expect(result.trim()).toBe('passed');
});

test('CI cancellation waits for the actual nested cleanup owner before deleting its root or accepting final evidence', () => {
  const result = probe(
    `
const {spawn}=await import('node:child_process');
const bin=path.join(root,'bin');await fs.mkdir(bin);
const ready=path.join(root,'nested-ready.json'),drained=path.join(root,'nested-drained'),output=path.join(root,'artifact');
const token=crypto.randomUUID();
const descendantCode="import fs from 'node:fs';import{createServer}from'node:http';process.on('SIGTERM',()=>{});const server=createServer((_request,response)=>response.end("+JSON.stringify(token)+"));server.listen(0,'127.0.0.1',()=>fs.writeFileSync("+JSON.stringify(ready)+",JSON.stringify({childPid:process.pid,runnerPid:process.ppid,ownedRoot:process.env.TMPDIR,port:server.address().port,token:"+JSON.stringify(token)+"})));";
const runnerCode="#!/usr/bin/env node\\nimport fs from 'node:fs/promises';import path from 'node:path';import{launchCandidateOwnedProcess}from "+JSON.stringify(${JSON.stringify(pathToFileURL(resolve(__dirname, '../candidate-consumer/browser-runner.mjs')).href)})+";if(!process.argv.includes('candidate-recovery-browser'))process.exit(0);try{await launchCandidateOwnedProcess({command:process.execPath,args:['--input-type=module','-e',"+JSON.stringify(descendantCode)+"],cwd:process.env.TMPDIR,environment:{PATH:process.env.PATH,TMPDIR:process.env.TMPDIR},logPath:path.join(process.env.TMPDIR,'nested-owned.log'),runtimeTimeoutMs:120000,terminationGraceMs:10000,drainTimeoutMs:10000});}catch(error){process.exitCode=1;}finally{await fs.writeFile("+JSON.stringify(drained)+",'nested child fully drained');}";
await fs.writeFile(path.join(bin,'npx'),runnerCode,{mode:0o755});
const child=spawn(process.execPath,[${JSON.stringify(resolve(__dirname, '../candidate-consumer/ci.mjs'))},'--evidence='+output],{env:{PATH:bin+path.delimiter+process.env.PATH},detached:true,stdio:['ignore','pipe','pipe']});
let diagnostics='';child.stdout.on('data',bytes=>diagnostics+=bytes);child.stderr.on('data',bytes=>diagnostics+=bytes);
const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
let receipt;
const listening=async()=>{if(!receipt)return false;try{const response=await fetch('http://127.0.0.1:'+receipt.port,{signal:AbortSignal.timeout(250)});return await response.text()===token;}catch{return false;}};
const kill=pid=>{if(!pid)return;try{process.kill(-pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}};
try{
 const deadline=performance.now()+8000;
 while(!receipt&&performance.now()<deadline){try{receipt=JSON.parse(await fs.readFile(ready,'utf8'));}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}if(!receipt)await new Promise(resolve=>setTimeout(resolve,10));}
 assert.ok(receipt,'Actual separately owned descendant readiness required');assert.equal(receipt.token,token);assert.equal(await listening(),true);
 child.kill('SIGTERM');
 let timer;let outcome;
 try{outcome=await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('CI owner did not finish bounded nested cancellation')),25000);})]);}finally{clearTimeout(timer);}
 assert.notEqual(outcome.code,0,'Cancelled actual CI process must fail');
 assert.equal(await fs.readFile(drained,'utf8').catch(()=>null),'nested child fully drained','Outer CI escalation killed the inner cleanup owner before it drained its separate group');
 assert.equal(await listening(),false,'Actual resistant nested listener survived finalization');
 assert.equal(await fs.stat(receipt.ownedRoot).then(()=>true,()=>false),false);
 const summary=JSON.parse(await fs.readFile(path.join(output,'ci-summary.json'),'utf8'));assert.equal(summary.status,'failed');
}finally{
 // Supervisor retains all positively identified new groups even when the tested owner fails.
 if(receipt){kill(receipt.childPid);kill(receipt.runnerPid);}kill(child.pid);
 await closed;
 if(receipt){const end=performance.now()+3000;while(await listening()&&performance.now()<end)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(await listening(),false,'Supervisor failed to stop its owned listener');await fs.rm(receipt.ownedRoot,{recursive:true,force:true});}
}
`,
    45_000,
  );

  expect(result.trim()).toBe('passed');
}, 55_000);
