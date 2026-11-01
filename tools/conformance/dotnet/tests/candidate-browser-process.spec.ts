import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runnerUrl = pathToFileURL(
  resolve(__dirname, '../candidate-consumer/browser-runner.mjs'),
).href;

/** Runs an actual newly owned leader/descendant regression; finally kills only its positively identified new group. */
function processRegression(mode: 'early-exit' | 'timeout'): string {
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
const { launchCandidateOwnedProcess, candidateBrowserPostflight } = await import(${JSON.stringify(runnerUrl)});
const mode = ${JSON.stringify(mode)};
const root = await fs.realpath(await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'candidate-owned-group-')));
const receiptPath = path.join(root, 'receipt.json');
const descendantPath = path.join(root, 'descendant.mjs');
const leaderPath = path.join(root, 'leader.mjs');
const descendant =
  "import {createServer} from 'node:http';" +
  "process.on('SIGTERM', () => { if (process.env.CANDIDATE_PROCESS_MODE !== 'timeout') process.exit(0); });" +
  "const server=createServer((_request,response)=>response.end('owned descendant'));" +
  "server.listen(0,'127.0.0.1',()=>process.send({pid:process.pid,port:server.address().port}));";
const leader =
  "import {spawn} from 'node:child_process';import {createServer} from 'node:http';import fs from 'node:fs/promises';" +
  "process.on('SIGTERM',()=>process.exit(0));" +
  "const child=spawn(process.execPath,[process.env.CANDIDATE_DESCENDANT],{env:process.env,stdio:['ignore','ignore','ignore','ipc']});" +
  "child.once('message',async ready=>{const control=createServer((_request,response)=>{response.end('exiting');setImmediate(()=>process.exit(23));});control.listen(0,'127.0.0.1',async()=>{await fs.writeFile(process.env.CANDIDATE_RECEIPT,JSON.stringify({leaderPid:process.pid,descendantPid:ready.pid,descendantPort:ready.port,controlPort:control.address().port}));});});";
await fs.writeFile(descendantPath, descendant);
await fs.writeFile(leaderPath, leader);
let ownedPid;
let receipt;
let completion;
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
const listening = async port => { try { const response = await fetch('http://127.0.0.1:' + port, {signal:AbortSignal.timeout(250)}); await response.text(); return true; } catch { return false; } };
try {
  completion = launchCandidateOwnedProcess({command:process.execPath,args:[leaderPath],cwd:root,environment:{PATH:process.env.PATH,CANDIDATE_PROCESS_MODE:mode,CANDIDATE_DESCENDANT:descendantPath,CANDIDATE_RECEIPT:receiptPath},logPath:path.join(root,'leader.log'),runtimeTimeoutMs:mode === 'timeout' ? 3000 : 10000,terminationGraceMs:150,drainTimeoutMs:2000,onSpawn:pid=>{ownedPid=pid;}}).then(status=>({status}),error=>({error}));
  const readyDeadline = performance.now()+2500;
  while (!receipt && performance.now()<readyDeadline) {
    try { receipt = JSON.parse(await fs.readFile(receiptPath,'utf8')); } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    if (!receipt) await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.ok(receipt, 'Actual owned descendant readiness receipt required');
  assert.equal(receipt.leaderPid, ownedPid, 'Receipt must identify the newly spawned group leader');
  assert.ok(alive(receipt.leaderPid), 'Owned leader must actually be alive before release/deadline');
  assert.ok(alive(receipt.descendantPid), 'Owned descendant must actually be alive');
  assert.equal(await listening(receipt.descendantPort), true, 'Actual owned descendant listener must be ready');
  if (mode === 'early-exit') await fetch('http://127.0.0.1:'+receipt.controlPort+'/exit').then(response=>response.text()).catch(()=>undefined);

  const outcome = await completion;
  let postflightWitness;
  const errors = await candidateBrowserPostflight({npm:async()=>{
    postflightWitness={descendantAlive:alive(receipt.descendantPid),descendantListening:await listening(receipt.descendantPort)};
    assert.equal(postflightWitness.descendantAlive,false,'Owned descendant PID survived into postqualification');
    assert.equal(postflightWitness.descendantListening,false,'Owned descendant listener survived into postqualification');
  },nuget:async()=>undefined,anchors:[]});

  assert.deepEqual(errors, [], 'Process group must drain before any postqualification callback');
  assert.deepEqual(postflightWitness,{descendantAlive:false,descendantListening:false});
  if (mode === 'early-exit') assert.equal(outcome.status,23,'Original unexpected leader status must be preserved');
  else assert.match(outcome.error?.message ?? '',/deadline|timeout/i,'Runtime timeout must remain a failure after descendant cleanup');
  assert.equal(alive(receipt.leaderPid),false);
} finally {
  if (ownedPid) { try { process.kill(-ownedPid,'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  if (completion) await completion;
  await fs.rm(root,{recursive:true,force:true});
}
console.log('passed');`,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
}

test('candidate launcher drains its actual owned descendant after unexpected direct leader exit before postqualification', () => {
  const result = processRegression('early-exit');

  expect(result.trim()).toBe('passed');
}, 30_000);

test('candidate launcher retains SIGKILL escalation when TERM closes the leader but an actual owned descendant ignores TERM', () => {
  const result = processRegression('timeout');

  expect(result.trim()).toBe('passed');
}, 30_000);

/** Supervises the launcher from outside its signal lifetime and always cleans only its positively recorded detached group. */
function launcherSignalRegression(signal: 'SIGINT' | 'SIGTERM'): string {
  const wrapper = `
import fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const {launchCandidateOwnedProcess,candidateBrowserPostflight}=await import(${JSON.stringify(runnerUrl)});
const root=process.env.CANDIDATE_SIGNAL_ROOT;
const signal=process.env.CANDIDATE_SIGNAL;
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
const listening=async port=>{try{const response=await fetch('http://127.0.0.1:'+port,{signal:AbortSignal.timeout(250)});await response.text();return true;}catch{return false;}};
const originalListeners={SIGINT:process.listenerCount('SIGINT'),SIGTERM:process.listenerCount('SIGTERM')};
let outcome;
try {
  const status=await launchCandidateOwnedProcess({command:process.execPath,args:[path.join(root,'leader.mjs')],cwd:root,environment:{PATH:process.env.PATH,CANDIDATE_SIGNAL_ROOT:root},logPath:path.join(root,'launcher.log'),runtimeTimeoutMs:12000,terminationGraceMs:150,drainTimeoutMs:2000,onSpawn:pid=>writeFileSync(path.join(root,'owned.json'),JSON.stringify({ownerPid:process.pid,groupPid:pid}))});
  outcome={status};
} catch(error) {outcome={error:{name:error.name,message:error.message}};}
const receipt=JSON.parse(await fs.readFile(path.join(root,'receipt.json'),'utf8'));
const calls=[];
const postflight=await candidateBrowserPostflight({npm:async()=>{calls.push({name:'npm',leaderAlive:alive(receipt.leaderPid),descendantAlive:alive(receipt.descendantPid),descendantListening:await listening(receipt.port)});},nuget:async()=>{calls.push({name:'nuget'});},anchors:[{label:'owned-anchor',check:async()=>{calls.push({name:'anchor'});}}]});
const remainingListeners={SIGINT:process.listenerCount('SIGINT'),SIGTERM:process.listenerCount('SIGTERM')};
await fs.writeFile(path.join(root,'outcome.json'),JSON.stringify({outcome,calls,postflight:postflight.map(error=>error.message),originalListeners,remainingListeners}));
process.exitCode=outcome.error?.message.includes(signal)?(signal==='SIGTERM'?143:130):0;
`;

  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const signal=${JSON.stringify(signal)};
const root=await fs.realpath(await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'candidate-launcher-signal-')));
const wrapper=${JSON.stringify(wrapper)};
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
const listening=async port=>{try{const response=await fetch('http://127.0.0.1:'+port,{signal:AbortSignal.timeout(250)});await response.text();return true;}catch{return false;}};
const read=async name=>{try{return JSON.parse(await fs.readFile(path.join(root,name),'utf8'));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return undefined;throw error;}};
let owner;
let owned;
let receipt;
let exited;
let ownerExit;
try {
  await fs.writeFile(path.join(root,'wrapper.mjs'),wrapper);
  await fs.writeFile(path.join(root,'descendant.mjs'),"import {createServer} from 'node:http';process.on('SIGTERM',()=>{});const server=createServer((_request,response)=>response.end('owned'));server.listen(0,'127.0.0.1',()=>process.send({pid:process.pid,port:server.address().port}));");
  await fs.writeFile(path.join(root,'leader.mjs'),"import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import path from 'node:path';process.on('SIGTERM',()=>process.exit(0));const child=spawn(process.execPath,[path.join(process.env.CANDIDATE_SIGNAL_ROOT,'descendant.mjs')],{env:process.env,stdio:['ignore','ignore','ignore','ipc']});child.once('message',async receipt=>{await fs.writeFile(path.join(process.env.CANDIDATE_SIGNAL_ROOT,'receipt.json'),JSON.stringify({leaderPid:process.pid,descendantPid:receipt.pid,port:receipt.port}));});");
  owner=spawn(process.execPath,[path.join(root,'wrapper.mjs')],{env:{PATH:process.env.PATH,CANDIDATE_SIGNAL_ROOT:root,CANDIDATE_SIGNAL:signal},stdio:'ignore'});
  exited=new Promise(resolve=>owner.once('exit',(code,signal)=>{ownerExit={code,signal};resolve();}));
  const readyDeadline=performance.now()+4000;
  while(!receipt&&performance.now()<readyDeadline){owned=await read('owned.json');receipt=await read('receipt.json');if(!receipt)await new Promise(resolve=>setTimeout(resolve,10));}
  assert.ok(owned&&receipt,'Actual launcher and descendant readiness required');
  assert.equal(owned.ownerPid,owner.pid,'Receipt must name this exact wrapper');
  assert.equal(owned.groupPid,receipt.leaderPid,'Only this actual detached group may be cleaned');
  assert.ok(alive(owner.pid)&&alive(receipt.leaderPid)&&alive(receipt.descendantPid),'All three actual processes must be alive before the signal');
  assert.equal(await listening(receipt.port),true,'Owned descendant must be listening before interruption');

  const interruptedAt=performance.now();
  process.kill(owner.pid,signal);
  while(!ownerExit&&performance.now()-interruptedAt<7000)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(ownerExit,'Interrupted launcher must finish within bounded drain');
  const result=await read('outcome.json');
  assert.ok(result,'Interrupted launcher must survive to execute actual postflight callbacks');
  assert.match(result.outcome.error?.message??'',new RegExp(signal),'Original external signal must remain a failure');
  assert.deepEqual(ownerExit,{code:signal==='SIGTERM'?143:130,signal:null},'Signal failure status must survive cleanup and postflight');
  assert.deepEqual(result.calls,[{name:'npm',leaderAlive:false,descendantAlive:false,descendantListening:false},{name:'nuget'},{name:'anchor'}],'Actual postflight callbacks must run only after the owned group drains');
  assert.deepEqual(result.postflight,[]);
  assert.deepEqual(result.remainingListeners,result.originalListeners,'Launcher signal handlers must not leak into postflight');
  assert.equal(alive(receipt.leaderPid),false);
  assert.equal(alive(receipt.descendantPid),false);
} finally {
  owned??=await read('owned.json');
  if(owned&&owner&&owned.ownerPid===owner.pid){try{process.kill(-owned.groupPid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}
  if(owner&&!ownerExit){try{process.kill(owner.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}
  if(exited)await exited;
  await fs.rm(root,{recursive:true,force:true});
}
console.log('passed');`,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
}

test('candidate launcher drains its actual group and reaches postflight after external SIGTERM', () => {
  const result = launcherSignalRegression('SIGTERM');

  expect(result.trim()).toBe('passed');
}, 30_000);

test('candidate launcher drains its actual group and reaches postflight after external SIGINT', () => {
  const result = launcherSignalRegression('SIGINT');

  expect(result.trim()).toBe('passed');
}, 30_000);
