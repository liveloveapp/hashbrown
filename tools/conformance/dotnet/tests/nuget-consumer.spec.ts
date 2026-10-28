import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const verifier = resolve(__dirname, '../nuget-consumer/verify.mjs');

/** Runs isolation assertions in the verifier's native ESM runtime. */
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
import * as v from ${JSON.stringify(`file://${verifier}`)};
${body}
console.log('passed');`,
    ],
    { encoding: 'utf8', timeout },
  );
}

test('strips source fallback credential and MSBuild environment injection', () => {
  const body = `
const good = { PATH:'/bin', HOME:'/tmp', DOTNET_ROOT:'/sdk', OPENAI_API_KEY:'secret', RestoreSources:'/evil', MSBuildExtensionsPath:'/evil', NUGET_PACKAGES:'/forbidden', NODE_OPTIONS:'injected' };
const env = v.buildEnvironment(good, '/private/tmp/owned');
assert.equal(env.RestoreSources, undefined);
assert.equal(env.OPENAI_API_KEY, undefined);
assert.equal(env.MSBuildExtensionsPath, undefined);
assert.equal(env.NUGET_PACKAGES, '/private/tmp/owned/packages');
assert.equal(env.DOTNET_CLI_HOME, '/private/tmp/owned/home');
assert.throws(() => v.validateEnvironment({...env, RestoreSources:'/evil'}, '/private/tmp/owned'), /environment/i);
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('requires exclusive exact source mapping and clears inherited fallbacks', () => {
  const body = `
const closure=[{id:'Dependency',version:'1.0.0',contentHash:'abc'}];
const good=v.createConfig('/private/tmp/owned',closure);
v.validateConfig(good,'/private/tmp/owned',closure);
for(const bad of [good.replace('pattern="Dependency"','pattern="*"'),good.replace('<clear />',''),good.replace('pattern="Hashbrown.AspNetCore"','pattern="Hashbrown.*"'),good.replace('/candidate-feed','/forbidden-global-cache'),good.replace('<fallbackPackageFolders><clear /></fallbackPackageFolders>','<fallbackPackageFolders><add key="bad" value="/cache" /></fallbackPackageFolders>')]) {
 assert.throws(()=>v.validateConfig(bad,'/private/tmp/owned',closure),/config|mapping|source|fallback/i);
}`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('rejects project references compile hint paths and imported fallback code', () => {
  const body = `
const root='/private/tmp/owned';
const good={Items:{Compile:[{FullPath:root+'/app/Program.cs'}],ProjectReference:[],Reference:[]},Properties:{MSBuildAllProjects:root+'/app/Consumer.csproj;/sdk/Sdks/Microsoft.NET.Sdk/targets/Microsoft.NET.Sdk.targets',RestoreFallbackFolders:'',RestoreAdditionalProjectSources:'',RestoreSources:root+'/candidate-feed;'+root+'/dependency-feed'}};
v.validateEvaluation(good,root,'/repo','/sdk');
for(const mutate of [x=>x.Items.ProjectReference.push({FullPath:'/repo/source.csproj'}),x=>x.Items.Compile.push({FullPath:'/repo/Integration.cs'}),x=>x.Items.Reference.push({HintPath:'/repo/bin/Hashbrown.AspNetCore.dll'}),x=>x.Items.Reference.push({HintPath:root+'/app/local.dll'}),x=>x.Items.Compile.push({FullPath:root+'/app/Injected.cs'}),x=>x.Properties.MSBuildAllProjects+=';/private/tmp/Directory.Build.targets',x=>x.Properties.MSBuildAllProjects+=';'+root+'/app/Injected.targets',x=>x.Properties.RestoreFallbackFolders='/forbidden-global-cache']) {
 const copy=structuredClone(good);mutate(copy);assert.throws(()=>v.validateEvaluation(copy,root,'/repo','/sdk'),/reference|compile|import|fallback/i);
}`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('rejects project libraries stale assets and wrong or absent candidate despite global sentinel', () => {
  const body = `
const root='/private/tmp/owned';
const identity={id:'Hashbrown.AspNetCore',version:'0.1.0-preview.1'};
const good={version:3,targets:{'net10.0':{'Hashbrown.AspNetCore/0.1.0-preview.1':{type:'package'}}},libraries:{'Hashbrown.AspNetCore/0.1.0-preview.1':{type:'package',sha512:'candidate'}},packageFolders:{[root+'/packages/']:{}},project:{restore:{projectPath:root+'/app/Consumer.csproj',packagesPath:root+'/packages',sources:{[root+'/candidate-feed']:{},[root+'/dependency-feed']:{}}}}};
v.validateAssets(good,root,identity,[],'candidate');
for(const mutate of [x=>delete x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'],x=>x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'].type='project',x=>{x.libraries['Wrong.Id/0.1.0-preview.1']=x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'];delete x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'];},x=>{x.libraries['Hashbrown.AspNetCore/0.1.0-preview.999']=x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'];delete x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'];},x=>x.packageFolders={'/forbidden-global-cache/':{}},x=>x.project.restore.projectPath='/repo/Consumer.csproj',x=>x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'].sha512='wrong']) {
 const copy=structuredClone(good);mutate(copy);assert.throws(()=>v.validateAssets(copy,root,identity,[],'candidate'),/asset|package|candidate|closure/i);
}`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('each copied valid fixture rejects archive metadata lock DLL source config and stale output tampering', () => {
  const body = `
const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nuget-fixtures-')));
try {
 const original=path.join(parent,'valid');await fs.mkdir(original);
 const files=['candidate.nupkg','packages.lock.json','Hashbrown.AspNetCore.dll','Program.cs','NuGet.Config','project.assets.json','Consumer.deps.json'];
 for(const file of files)await fs.writeFile(path.join(original,file),'valid '+file);
 const manifest=await v.fingerprintFiles(original,files);
 await v.verifyFiles(original,manifest);
 for(const file of files){
  const copy=path.join(parent,file.replaceAll('.','-'));await fs.cp(original,copy,{recursive:true});
  await fs.appendFile(path.join(copy,file),'tampered');
  await assert.rejects(()=>v.verifyFiles(copy,manifest),/hash|changed|integrity/i);
 }
 const copy=path.join(parent,'symlink');await fs.cp(original,copy,{recursive:true});
 await fs.rm(path.join(copy,'Program.cs'));await fs.symlink(path.join(original,'Program.cs'),path.join(copy,'Program.cs'));
 await assert.rejects(()=>v.verifyFiles(copy,manifest),/symlink|escape/i);
 await assert.rejects(()=>v.fingerprintFiles(original,['../valid/Program.cs']),/escape|relative/i);
 const metadata=path.join(parent,'metadata.json');await fs.writeFile(metadata,JSON.stringify({manifest}));
 const pointer={metadata,sha256:await v.hashFile(metadata)};
 await v.readAnchoredMetadata(pointer);
 await fs.writeFile(metadata,JSON.stringify({manifest:{}}));
 await assert.rejects(()=>v.readAnchoredMetadata(pointer),/metadata|anchor/i);
} finally {await fs.rm(parent,{recursive:true,force:true});}`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('rejects repository ancestry and inherited Directory.Build props and targets', () => {
  const body = `
v.validateIsolation('/private/tmp/owned','/repo/project');
for(const root of ['/repo','/repo/project','/repo/project/tmp']) assert.throws(()=>v.validateIsolation(root,'/repo/project'),/ancestry|isolation/i);
const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nuget-inherit-')));
try {
 const root=path.join(parent,'owned');await fs.mkdir(root);
 await v.validateAncestors(root);
 for(const file of ['Directory.Build.props','Directory.Build.targets']) {
  await fs.writeFile(path.join(parent,file),'<Project />');
  await assert.rejects(()=>v.validateAncestors(root),/inherited/i);
  await fs.rm(path.join(parent,file));
 }
} finally {await fs.rm(parent,{recursive:true,force:true});}`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('rejects forged lock deps and NuGet source metadata against the approved closure', () => {
  const body = `
const identity={id:'Hashbrown.AspNetCore',version:'0.1.0-preview.1'};
const closure=[{id:'Dependency',version:'1.0.0',contentHash:'dependency'}];
const lock={dependencies:{'net10.0':{'Hashbrown.AspNetCore':{type:'Direct',requested:'[0.1.0-preview.1, 0.1.0-preview.1]',resolved:identity.version,contentHash:'candidate'},Dependency:{type:'Transitive',resolved:'1.0.0',contentHash:'dependency'}}}};
v.validateLock(lock,identity,closure,'candidate');
for(const mutate of [x=>x.dependencies['net10.0'].Dependency.resolved='2.0.0',x=>x.dependencies['net10.0']['Hashbrown.AspNetCore'].requested='[0.1.0-preview.1, )',x=>delete x.dependencies['net10.0']['Hashbrown.AspNetCore']]){const copy=structuredClone(lock);mutate(copy);assert.throws(()=>v.validateLock(copy,identity,closure,'candidate'),/lock|candidate|closure/i);}
const deps={runtimeTarget:{name:'.NETCoreApp,Version=v10.0'},targets:{'.NETCoreApp,Version=v10.0':{'Consumer/1.0.0':{runtime:{'Consumer.dll':{}}},'Hashbrown.AspNetCore/0.1.0-preview.1':{runtime:{'lib/net10.0/Hashbrown.AspNetCore.dll':{}}},'Dependency/1.0.0':{}}},libraries:{'Consumer/1.0.0':{type:'project'},'Hashbrown.AspNetCore/0.1.0-preview.1':{type:'package'},'Dependency/1.0.0':{type:'package'}}};
v.validateDeps(deps,identity,closure);
for(const mutate of [x=>x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'].type='project',x=>{x.libraries['Wrong.Id/0.1.0-preview.1']=x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'];delete x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'];},x=>{x.libraries['Hashbrown.AspNetCore/0.1.0-preview.999']=x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'];delete x.libraries['Hashbrown.AspNetCore/0.1.0-preview.1'];},x=>x.libraries['Workspace/1.0.0']={type:'project'},x=>delete x.targets['.NETCoreApp,Version=v10.0']['Hashbrown.AspNetCore/0.1.0-preview.1']]){const copy=structuredClone(deps);mutate(copy);assert.throws(()=>v.validateDeps(copy,identity,closure),/deps|runtime|candidate|closure/i);}
v.validateSourceMetadata({version:2,contentHash:'candidate',source:'/owned/candidate-feed'},'/owned/candidate-feed','candidate');
for(const value of [{version:2,contentHash:'candidate',source:'/forbidden-global-cache'},{version:2,contentHash:'wrong',source:'/owned/candidate-feed'}])assert.throws(()=>v.validateSourceMetadata(value,'/owned/candidate-feed','candidate'),/source|hash/i);`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('actual prepared consumer copies reject tampering before the qualification launch boundary', () => {
  const prepare = resolve(__dirname, '../nuget-consumer/prepare.mjs');
  const qualify = resolve(__dirname, '../nuget-consumer/qualify.mjs');
  const body = `
import {prepareConsumer} from ${JSON.stringify(`file://${prepare}`)};
import {qualifyConsumer} from ${JSON.stringify(`file://${qualify}`)};
const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nuget-real-mutations-')));
let prepared;
try {
 prepared=await prepareConsumer(path.join(parent,'candidate.json'));
 const trusted=JSON.parse(await fs.readFile(prepared.metadata,'utf8'));
 assert.ok((await fs.readdir(trusted.restoreNegative.sentinel)).includes('hashbrown.aspnetcore.nuspec'),'Sentinel nuspec must use the canonical global-cache filename');
 const archive=await fs.readFile(path.join(trusted.root,trusted.archive));
 for(const identity of [{...trusted.identity,id:'Wrong.Id'},{...trusted.identity,version:'0.1.0-preview.999'}])assert.throws(()=>v.validateArchive(archive,identity,trusted.revision),/candidate ID|version/i);
 const repository=path.join(parent,'repository');await fs.mkdir(repository);
 for(const file of Object.keys(trusted.sources)) {await fs.mkdir(path.dirname(path.join(repository,file)),{recursive:true});await fs.copyFile(path.join(trusted.repository,file),path.join(repository,file));}
 for(const mutation of ['archive','missing-candidate','lock','dll','source','metadata','config','assets','deps','import','project-reference','symlink','pointer','changed-source-after-qualification']) {
  const copy=path.join(parent,'copy');
  await fs.cp(trusted.root,copy,{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
  let metadata=JSON.parse(JSON.stringify(trusted).replaceAll(trusted.root,copy));metadata.repository=repository;
  for(const file of Object.keys(metadata.files)) {
   if(/[.](json|config|csproj|props|targets|xml|metadata)$/i.test(file)) {
    const content=await fs.readFile(path.join(copy,file),'utf8');
    if(content.includes(trusted.root))await fs.writeFile(path.join(copy,file),content.replaceAll(trusted.root,copy));
   }
  }
  metadata.files=await v.fingerprintFiles(copy,Object.keys(metadata.files));
  for(const role of Object.values(metadata.roles ?? {})) {
   role.files=await v.fingerprintFiles(copy,Object.keys(role.files));
   for(const file of Object.keys(role.inputs)) role.inputs[file]=await v.hashFile(file);
  }
  const location=path.join(copy,'metadata.json');await fs.rm(location);await fs.writeFile(location,JSON.stringify(metadata));
  const pointer=path.join(parent,'copy-pointer.json');await fs.writeFile(pointer,JSON.stringify({metadata:location,sha256:await v.hashFile(location)}));await fs.writeFile(pointer+'.sha256',await v.hashFile(pointer));
  let launches=0;
  const launch=async()=>{launches++;return JSON.stringify(metadata.loaded);};
  await qualifyConsumer(pointer,launch);assert.equal(launches,1);launches=0;
  const append=async(file)=>fs.appendFile(path.join(copy,file),'tampered');
  if(mutation==='archive')await append(metadata.archive);
  else if(mutation==='missing-candidate')await fs.rm(path.join(copy,metadata.archive));
  else if(mutation==='lock')await append('app/packages.lock.json');
  else if(mutation==='dll')await append('app/bin/Release/net10.0/Hashbrown.AspNetCore.dll');
  else if(mutation==='source')await append('app/Program.cs');
  else if(mutation==='metadata')await append('metadata.json');
  else if(mutation==='config')await append('NuGet.Config');
  else if(mutation==='assets')await append('app/obj/project.assets.json');
  else if(mutation==='deps')await append('app/bin/Release/net10.0/Consumer.deps.json');
  else if(mutation==='import')await fs.writeFile(path.join(copy,'Directory.Build.targets'),'<Project />');
  else if(mutation==='project-reference'){
   const file=path.join(copy,'app/Consumer.csproj');const text=await fs.readFile(file,'utf8');
   await fs.writeFile(file,text.replace('</Project>','<ItemGroup><ProjectReference Include="'+repository+'/packages/dotnet/Hashbrown.AspNetCore.csproj" /></ItemGroup></Project>'));
  }
  else if(mutation==='symlink'){await fs.rm(path.join(copy,'app/Program.cs'));await fs.symlink(path.join(trusted.root,'app/Program.cs'),path.join(copy,'app/Program.cs'));}
  else if(mutation==='pointer')await fs.appendFile(pointer,' ');
  else await fs.appendFile(path.join(repository,'packages/dotnet/src/HashbrownEndpointConfiguration.cs'),'changed after qualification');
  await assert.rejects(()=>qualifyConsumer(pointer,launch),undefined,mutation+' must fail before launch');assert.equal(launches,0,mutation);
  if(mutation==='changed-source-after-qualification')await fs.copyFile(path.join(trusted.repository,'packages/dotnet/src/HashbrownEndpointConfiguration.cs'),path.join(repository,'packages/dotnet/src/HashbrownEndpointConfiguration.cs'));
  await fs.rm(copy,{recursive:true,force:true});
 }
} finally {if(prepared)await fs.rm(prepared.root,{recursive:true,force:true});await fs.rm(parent,{recursive:true,force:true});}`;

  const result = probe(body, 180_000);

  expect(result.trim()).toBe('passed');
}, 200_000);

test('rejects a wrong implementation DLL before the first smoke effect', () => {
  const body = `
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nuget-dll-')));
try {
 const output=path.join(root,'Hashbrown.AspNetCore.dll');await fs.writeFile(output,'actual candidate');
 await v.validateImplementation(Buffer.from('actual candidate'),output);
 await fs.writeFile(output,'wrong implementation');
 await assert.rejects(()=>v.validateImplementation(Buffer.from('actual candidate'),output),/DLL|implementation|candidate/i);
 const target=path.join(root,'actual.dll');await fs.writeFile(target,'actual candidate');await fs.rm(output);await fs.symlink(target,output);
 await assert.rejects(()=>v.validateImplementation(Buffer.from('actual candidate'),output),/symlink|escape/i);
} finally {await fs.rm(root,{recursive:true,force:true});}`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('rejects added or removed source files after qualification', () => {
  const body = `
v.validateSourceManifest({'src/Original.cs':'hash'},['src/Original.cs']);
for(const files of [[],['src/Original.cs','src/Injected.cs']])assert.throws(()=>v.validateSourceManifest({'src/Original.cs':'hash'},files),/source|closure/i);`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

const runtimeSelector = resolve(__dirname, '../nuget-consumer/roles.mjs');

for (const family of ['Microsoft.NETCore.App', 'Microsoft.AspNetCore.App']) {
  test(`runtime selection ignores other major and minor versions for ${family}`, () => {
    const body = `
import {selectRuntime} from ${JSON.stringify(`file://${runtimeSelector}`)};
const list = ['10.0.9', '10.0.13', '10.1.20', '11.0.20'].map(version => '${family} '+version+' [/sdk/shared/${family}]').join(String.fromCharCode(10));
assert.equal(selectRuntime(list, '${family}', 'net10.0')[2], '10.0.13');`;

    const result = probe(body);

    expect(result.trim()).toBe('passed');
  });

  test(`runtime selection orders compatible patches numerically for ${family}`, () => {
    const body = `
import {selectRuntime} from ${JSON.stringify(`file://${runtimeSelector}`)};
const list = ['10.0.100', '10.0.13', '10.0.9'].map(version => '${family} '+version+' [/sdk/shared/${family}]').join(String.fromCharCode(10));
assert.equal(selectRuntime(list, '${family}', 'net10.0')[2], '10.0.100');`;

    const result = probe(body);

    expect(result.trim()).toBe('passed');
  });

  test(`runtime selection fails closed without net10 for ${family}`, () => {
    const body = `
import {selectRuntime} from ${JSON.stringify(`file://${runtimeSelector}`)};
const list = ['9.0.20', '10.1.1', '11.0.1'].map(version => '${family} '+version+' [/sdk/shared/${family}]').join(String.fromCharCode(10));
assert.throws(() => selectRuntime(list, '${family}', 'net10.0'), /Required net10[.]0 shared runtime missing/);`;

    const result = probe(body);

    expect(result.trim()).toBe('passed');
  });

  test(`runtime selection rejects malformed and unsafe patches for ${family}`, () => {
    const body = `
import {selectRuntime} from ${JSON.stringify(`file://${runtimeSelector}`)};
const list = ['10.0.13', '10.0.14-preview.1', '10.0.-1', '10.0.NaN', '10.0.9007199254740992'].map(version => '${family} '+version+' [/sdk/shared/${family}]').join(String.fromCharCode(10));
assert.equal(selectRuntime(list, '${family}', 'net10.0')[2], '10.0.13');`;

    const result = probe(body);

    expect(result.trim()).toBe('passed');
  });
}

test('acceptance executes each phase once and stops on a real child failure', () => {
  const result = probe(`
const {executePhases}=await import(${JSON.stringify(`file://${resolve('tools/conformance/dotnet/nuget-consumer/run.mjs')}`)});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptance-control-'));
try {
 const phases=[{name:'pack',argv:['-e','process.exit(0)'],timeout:5000},{name:'npm',argv:['-e','process.exit(7)'],timeout:5000},{name:'matrix',argv:['-e','process.exit(0)'],timeout:5000}];
 const report={phases:[]};
 await assert.rejects(()=>executePhases(phases,root,report),/npm.*7/);
 assert.deepEqual(report.phases.map(x=>x.name),['pack','npm']);
 assert.equal(report.phases[1].status,7);
}finally{await fs.rm(root,{recursive:true,force:true});}
`);

  expect(result.trim().split('\n').at(-1)).toBe('passed');
});

test('acceptance requires current candidate metadata and exact baseline before scheduling children', () => {
  const result = probe(`
const {validateAcceptanceInputs}=await import(${JSON.stringify(`file://${resolve('tools/conformance/dotnet/nuget-consumer/run.mjs')}`)});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptance-input-'));
try {
 await assert.rejects(()=>validateAcceptanceInputs(root),/baseline|ENOENT/);
 await assert.rejects(()=>validateAcceptanceInputs(${JSON.stringify(resolve('.'))},path.join(root,'missing.json')),/ENOENT/);
}finally{await fs.rm(root,{recursive:true,force:true});}
`);

  expect(result.trim()).toBe('passed');
});

test('CI requires uncached package acceptance for library changes and fails its existing strict gate', () => {
  const result = probe(`
const project=JSON.parse(await fs.readFile('tools/conformance/dotnet/project.json','utf8'));
assert.equal(project.targets['package-acceptance'].cache,false);
assert.ok(project.implicitDependencies.includes('dotnet-sdk'));
const workflow=await fs.readFile('.github/workflows/pr-main.yml','utf8');
assert.ok(workflow.includes('npx nx package-acceptance dotnet-conformance'));
assert.ok(!workflow.includes('npx nx provider-e2e dotnet-conformance'));
assert.ok(!workflow.includes('npx nx prepare-live-consumer dotnet-conformance'));
assert.ok(workflow.includes('needs: [ci, targets, preview]'));
assert.ok(workflow.includes('if [[ "$CI_RESULT" != "success" ]]'));
assert.ok(workflow.includes('timeout-minutes: 90'));
const {spawnSync}=await import('node:child_process');
const marker='        run: |';
const gate=workflow.slice(workflow.lastIndexOf(marker)+marker.length).split('\\n').map(line=>line.replace(/^          /,'')).join('\\n');
for(const result of ['failure','skipped','cancelled'])assert.equal(spawnSync('bash',['-c',gate],{env:{PATH:process.env.PATH,CI_RESULT:result,TARGETS_RESULT:'success',PREVIEW_RESULT:'skipped'}}).status,1);
assert.equal(spawnSync('bash',['-c',gate],{env:{PATH:process.env.PATH,CI_RESULT:'success',TARGETS_RESULT:'success',PREVIEW_RESULT:'skipped'}}).status,0);

assert.ok(workflow.includes('packages/dotnet/packages.lock.json'));
assert.ok(workflow.includes('tests/fixtures/pre-extraction-host.json'));
`);

  expect(result.trim()).toBe('passed');
});

test('acceptance plan schedules one candidate one npm preparation and exact package gates with no source matrix', () => {
  const result = probe(`
const {acceptancePlan}=await import(${JSON.stringify(`file://${resolve('tools/conformance/dotnet/nuget-consumer/run.mjs')}`)});
const plan=acceptancePlan('/tmp/current.json','/tmp/npm.json');
assert.deepEqual(plan.map(x=>x.name),['candidate','npm','initial-qualification','docs','upgrade','matrix','regressions','final-qualification','final-npm-qualification']);
assert.equal(plan.filter(x=>x.argv.some(a=>a.endsWith('/nuget-consumer/prepare.mjs'))).length,1);
assert.equal(plan.filter(x=>x.argv.some(a=>a.endsWith('/live-consumer/prepare.mjs'))).length,1);
assert.ok(plan.every(x=>!x.argv.some(a=>/provider-e2e|dotnet.playwright|retries/.test(a))));
for(const name of ['matrix','regressions'])assert.ok(plan.find(x=>x.name===name).argv.includes('/tmp/npm.json'));
assert.deepEqual(plan.at(-1).argv.slice(-1),['/tmp/npm.json']);
`);

  expect(result.trim()).toBe('passed');
});

test('acceptance bounds sanitizes diagnostics and fails timed out children without retry', () => {
  const result = probe(`
const {executePhases,sanitize}=await import(${JSON.stringify(`file://${resolve('tools/conformance/dotnet/nuget-consumer/run.mjs')}`)});
assert.equal(sanitize({environment:{SECRET:'hidden'},password:'hidden',safe:'Password=hidden; token=private'}).safe,'Password=[redacted]; token=[redacted]');
assert.ok(!JSON.stringify(sanitize({environment:{SECRET:'hidden'}})).includes('hidden'));
assert.ok(!sanitize('Authorization: Bearer abc-secret').includes('abc-secret'));
assert.ok(!sanitize('"password": "json-secret"').includes('json-secret'));
assert.ok(!sanitize('Host=db;Password=connection-secret;Database=x').includes('connection-secret'));
const capability={token:'capability-one',claim_token:'capability-two',capture_token:'capability-three',claimToken:'capability-four',accessToken:'capability-five',inputTokens:12,outputTokens:7,'Microsoft.ML.Tokenizers.dll':'hash-one','BearerToken.dll':'hash-two',tokenHash:'hash-three'};
const cleaned=sanitize(capability);
assert.equal(sanitize({PublicKeyToken:'public-assembly-identity'}).PublicKeyToken,'public-assembly-identity');
assert.ok(sanitize(JSON.stringify({PublicKeyToken:'public-assembly-identity'})).includes('public-assembly-identity'));

for(const key of ['token','claim_token','capture_token','claimToken','accessToken'])assert.ok(!JSON.stringify(cleaned).includes(capability[key]),key);
for(const key of ['inputTokens','outputTokens','Microsoft.ML.Tokenizers.dll','BearerToken.dll','tokenHash'])assert.equal(cleaned[key],capability[key],key);
for(const key of ['token','claim_token','capture_token','claimToken','accessToken'])assert.ok(!sanitize(JSON.stringify({[key]:'raw-json-capability'})).includes('raw-json-capability'),key);


const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptance-timeout-'));
try {
 const report={phases:[]};
 await assert.rejects(()=>executePhases([{name:'hung',argv:['-e','console.log("Password=hidden");setInterval(()=>{},1000)'],timeout:100}],root,report),/hung.*timeout/);
 assert.equal(report.phases.length,1);
 assert.ok(!(await fs.readFile(path.join(root,'hung.log'),'utf8')).includes('hidden'));
 assert.ok(sanitize('x'.repeat(5*1024*1024)).length<=4*1024*1024);
}finally{await fs.rm(root,{recursive:true,force:true});}
`);

  expect(result.trim()).toBe('passed');
});

/** Exercises the actual CLI/finally/export implementation with isolated child and archive adapters. */
function acceptanceFailureCase(mode: string): string {
  return probe(`
const {spawnSync}=await import('node:child_process');
const repository=${JSON.stringify(resolve('.'))};
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'acceptance-export-case-')));
const mode=${JSON.stringify(mode)};
try {
 const candidateRoot=path.join(root,'candidate');await fs.mkdir(path.join(candidateRoot,'candidate-feed'),{recursive:true});
 for(const extension of ['nupkg','snupkg'])await fs.writeFile(path.join(candidateRoot,'candidate-feed','candidate.'+extension),'synthetic archive');
 const candidate={root:candidateRoot,archive:'candidate-feed/candidate.nupkg',sha256:'synthetic-review-only',loaded:{identity:'synthetic-review-only'}};
 await fs.writeFile(path.join(root,'config.json'),JSON.stringify({repository,root,candidate,mode}));
 await fs.writeFile(path.join(root,'adapters.mjs'),\`
import fs from 'node:fs/promises';import path from 'node:path';import {EventEmitter} from 'node:events';import {createHash} from 'node:crypto';
const config=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
export const verifyConsumer=async()=>config.candidate;
export const hashFile=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
export const readArchive=()=>({});
export function spawn(command,argv,options){
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
 queueMicrotask(async()=>{
  let status=0;
  if(argv[0].endsWith('/nuget-consumer/prepare.mjs'))await fs.writeFile(argv.at(-1),'{}');
  else if(argv[0].endsWith('/live-consumer/prepare.mjs')){const metadataPath=path.join(config.root,'npm.json');await fs.writeFile(metadataPath,'{}');child.stdout.emit('data',Buffer.from(JSON.stringify({metadataPath})+'\\\\n'));}
  else if(argv[0].endsWith('/upgrade-runner.mjs')){
   const raw=options.env.HASHBROWN_UPGRADE_EVIDENCE_DIRECTORY;
   const gate=path.dirname(raw);const upload=path.join(config.repository,'test-results/dotnet-package',path.basename(gate));
   await fs.mkdir(raw,{recursive:true});
   await fs.writeFile(path.join(config.root,'paths.json'),JSON.stringify({raw,gate,upload}));
   const record={token:'FAILURE_CAPABILITY_SENTINEL',PublicKeyToken:'public-identity',inputTokens:12,outputTokens:7,'Microsoft.ML.Tokenizers.dll':'file-hash'};
   const text=JSON.stringify(record);
   await fs.writeFile(path.join(raw,'proof.json'),config.mode==='partial-json'?text.slice(0,-1):text);
   if(config.mode==='partial-jsonl')await fs.writeFile(path.join(raw,'records.jsonl'),text+'\\\\n'+text.slice(0,-1));
   if(config.mode==='cancellation')process.kill(process.pid,'SIGKILL');
   status=7;
  }
  child.emit('close',status);
 });return child;
}
\`);
 let source=await fs.readFile(path.join(repository,'tools/conformance/dotnet/nuget-consumer/run.mjs'),'utf8');
 source=source.replace("import { spawn } from 'node:child_process';","import { spawn } from './adapters.mjs';").replace("from './verify.mjs'","from './adapters.mjs'").replace("const here = path.dirname(fileURLToPath(import.meta.url));",'const here = '+JSON.stringify(path.join(repository,'tools/conformance/dotnet/nuget-consumer'))+';').replace("const repository = path.resolve(here, '../../../..');",'const repository = '+JSON.stringify(repository)+';');
 const script=path.join(root,'instrumented-run.mjs');await fs.writeFile(script,source);
 const result=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000});
 const locations=JSON.parse(await fs.readFile(path.join(root,'paths.json'),'utf8'));
 try {
  assert.ok(!locations.raw.startsWith(path.join(repository,'test-results')+path.sep),'raw evidence must stay outside upload ancestry');
  const files=await v.listFiles(locations.upload);
  for(const file of files)if(/\\.(json|jsonl|log)$/.test(file))assert.ok(!(await fs.readFile(path.join(locations.upload,file),'utf8')).includes('FAILURE_CAPABILITY_SENTINEL'),'raw capability in uploaded derivative');
  if(mode==='cancellation'){assert.equal(result.signal,'SIGKILL');assert.ok((await fs.readFile(path.join(locations.raw,'proof.json'),'utf8')).includes('FAILURE_CAPABILITY_SENTINEL'));}
  else {
   assert.equal(result.status,1);
   const report=JSON.parse(await fs.readFile(path.join(locations.upload,'acceptance.json'),'utf8'));
   assert.equal(report.status,'failed');assert.match(report.failure,/upgrade.*7/);assert.equal(report.phases.at(-1).status,7);
   assert.ok(report.exportErrors.length>0,'missing expected artifacts must fail export independently');
   if(mode==='partial-json')assert.ok(report.exportErrors.some(row=>row.code==='INVALID_JSON'));
   if(mode==='partial-jsonl')assert.ok(report.exportErrors.some(row=>row.code==='INVALID_JSONL'));
   if(mode!=='partial-json'){
    const proof=JSON.parse(await fs.readFile(path.join(locations.upload,'upgrade/proof.json'),'utf8'));
    assert.equal(proof.token,'[redacted]');assert.equal(proof.PublicKeyToken,'public-identity');assert.equal(proof.inputTokens,12);assert.equal(proof.outputTokens,7);assert.equal(proof['Microsoft.ML.Tokenizers.dll'],'file-hash');
   }
  }
 }finally{await fs.rm(locations.upload,{recursive:true,force:true});if(locations.gate!==locations.upload)await fs.rm(locations.gate,{recursive:true,force:true});}
}finally{await fs.rm(root,{recursive:true,force:true});}
`);
}

test('failed child and missing artifact preserve failure and export only safe derivatives', () => {
  const result = acceptanceFailureCase('missing-artifact');

  expect(result.trim().split('\n').at(-1)).toBe('passed');
});

test('partial JSON evidence cannot expose raw fragments or mask the original child failure', () => {
  const result = acceptanceFailureCase('partial-json');

  expect(result.trim().split('\n').at(-1)).toBe('passed');
});

test('partial JSONL evidence cannot expose raw fragments or mask the original child failure', () => {
  const result = acceptanceFailureCase('partial-jsonl');

  expect(result.trim().split('\n').at(-1)).toBe('passed');
});

test('actual process cancellation leaves raw evidence outside the upload tree', () => {
  const result = acceptanceFailureCase('cancellation');

  expect(result.trim().split('\n').at(-1)).toBe('passed');
});

test('redirected OS temp beneath uploads is rejected before any child can create raw evidence', () => {
  const result = probe(`
const {runAcceptance}=await import(${JSON.stringify(`file://${resolve('tools/conformance/dotnet/nuget-consumer/run.mjs')}`)});
const parent=path.resolve('test-results/dotnet-package');await fs.mkdir(parent,{recursive:true});
const root=await fs.mkdtemp(path.join(parent,'redirected-temp-'));
const previous=os.tmpdir;const argv=process.argv;
try {
 os.tmpdir=()=>root;process.argv=[process.execPath,'redirected-temp-test'];
 await assert.rejects(()=>runAcceptance(),/Private raw evidence must remain outside the upload tree/);
 assert.equal((await v.listFiles(root)).length,0,'no child output or candidate metadata may be created');
}finally{os.tmpdir=previous;process.argv=argv;await fs.rm(root,{recursive:true,force:true});}
`);

  expect(result.trim()).toBe('passed');
});

test('successful diagnostic export preserves structured provenance and exposes no raw child text', () => {
  const result = probe(`
const {exportDiagnostics}=await import(${JSON.stringify(`file://${resolve('tools/conformance/dotnet/nuget-consumer/run.mjs')}`)});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptance-safe-export-'));
try {
 const raw=path.join(root,'private'),output=path.join(root,'export');await fs.mkdir(raw);await fs.mkdir(output);
 const record={token:'EXPORT_CAPABILITY_SENTINEL',claim_token:'EXPORT_CAPABILITY_SENTINEL',captureToken:'EXPORT_CAPABILITY_SENTINEL',PublicKeyToken:'public-identity',inputTokens:12,outputTokens:7,'Microsoft.ML.Tokenizers.dll':'archive-hash',outcomes:[{identity:['project','file','case'],status:'passed',retry:0}]};
 await fs.writeFile(path.join(raw,'proof.json'),JSON.stringify(record));await fs.writeFile(path.join(raw,'proof.jsonl'),JSON.stringify(record)+'\\n');
 const log='unstructured EXPORT_CAPABILITY_SENTINEL and incomplete JSON';await fs.writeFile(path.join(raw,'phase.log'),log);
 const metadata={rows:Array.from({length:35000},()=> 'x'.repeat(128))};await fs.writeFile(path.join(raw,'large-metadata.json'),JSON.stringify(metadata));
 const errors=[];await exportDiagnostics(raw,output,errors);assert.deepEqual(errors,[]);
 assert.equal(JSON.parse(await fs.readFile(path.join(output,'large-metadata.json'),'utf8')).rows.length,35000);
 const exported=JSON.parse(await fs.readFile(path.join(output,'proof.json'),'utf8'));
 assert.equal(exported.token,'[redacted]');assert.equal(exported.claim_token,'[redacted]');assert.equal(exported.captureToken,'[redacted]');
 for(const key of ['PublicKeyToken','inputTokens','outputTokens','Microsoft.ML.Tokenizers.dll','outcomes'])assert.deepEqual(exported[key],record[key]);
 assert.deepEqual(JSON.parse((await fs.readFile(path.join(output,'proof.jsonl'),'utf8')).trim()),exported);
 const summary=JSON.parse(await fs.readFile(path.join(output,'phase.log'),'utf8'));assert.equal(summary.sha256,await v.hashFile(path.join(raw,'phase.log')));assert.equal(summary.bytes,Buffer.byteLength(log));
 for(const name of await fs.readdir(output))assert.ok(!(await fs.readFile(path.join(output,name),'utf8')).includes('EXPORT_CAPABILITY_SENTINEL'));
 assert.equal(await fs.readFile(path.join(raw,'phase.log'),'utf8'),log);
}finally{await fs.rm(root,{recursive:true,force:true});}
`);

  expect(result.trim()).toBe('passed');
});

test('browser child artifacts follow the private evidence root instead of repository failure-upload defaults', () => {
  const result = probe(`
const {packagePlaywrightArguments,packageEvidenceEnvironment}=await import(${JSON.stringify(`file://${resolve('tools/conformance/dotnet/nuget-consumer/browser-runner.mjs')}`)});
for(const kind of ['matrix','regressions']){
 const evidence='/private/tmp/owned-gate/browser';
 const argv=packagePlaywrightArguments('package.playwright.config.ts',evidence,kind);
 const env=packageEvidenceEnvironment(evidence,kind);assert.equal(env.HASHBROWN_PACKAGE_EVIDENCE_DIRECTORY,evidence);assert.equal(env.DOTNET_NATIVE_BROWSER_EVIDENCE,path.join(evidence,kind+'-native'));
 assert.equal(argv.filter(value=>value==='--output').length,1);
 assert.equal(argv[argv.indexOf('--output')+1],path.join(evidence,kind+'-playwright'));
 assert.ok(!argv.some(value=>/test-results|--retries|--grep|--max-failures/.test(value)));
}
`);

  expect(result.trim()).toBe('passed');
});

test('actual fixture startup failures keep package and historical raw diagnostics private while source routing stays unchanged', () => {
  const result = probe(`
const ts=await import('typescript');
const repository=${JSON.stringify(resolve('.'))};
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fixture-diagnostic-failure-')));
const sourceDirectory=path.join(repository,'test-results/conformance/dotnet/diagnostics');
await fs.mkdir(sourceDirectory,{recursive:true});
const originalEnvironment={...process.env};
try {
 let source=await fs.readFile(path.join(repository,'tools/conformance/dotnet/harness/http-fixture.ts'),'utf8');
 for(const original of ['./dotnet-host','@ag-ui/core/schemas','@copilotkit/aimock','node:child_process','./recovery-timings'])source=source.replaceAll("from '"+original+"'","from './adapters.mjs'");
 const javascript=ts.default.transpileModule(source,{compilerOptions:{module:ts.default.ModuleKind.ESNext,target:ts.default.ScriptTarget.ES2022}}).outputText;
 await fs.writeFile(path.join(root,'fixture.mjs'),javascript);
 await fs.writeFile(path.join(root,'adapters.mjs'),\`
import {EventEmitter} from 'node:events';
export const resolveDotnetHost=()=>({executable:'fixture-test-only',controlled:process.env.TEST_FIXTURE_MODE==='historical',loaded:process.env.TEST_FIXTURE_MODE==='package'?{}:undefined});
export const validateHostOverrides=()=>{};export const verifyLoadedDotnetHost=()=>{};export const fixtureChildEnvironment=()=>({});
export const recoveryRequestRecorder=()=>()=>()=>{};export const traceRecoveryRequest=()=>()=>{};export const EventSchemas={};
export class LLMock {onMessage(){}async start(){}async stop(){}}
export function spawn(){const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.exitCode=null;child.signalCode=null;queueMicrotask(()=>{child.stdout.emit('data','PRIVATE_FIXTURE_OUTPUT_SENTINEL');child.exitCode=7;child.emit('exit',7,null);});return child;}
\`);
 const {withDotnetFixture}=await import('file://'+path.join(root,'fixture.mjs'));
 for(const mode of ['package','historical','source']){
  const privateRoot=path.join(root,mode);await fs.mkdir(privateRoot);
  const before=new Set(await fs.readdir(sourceDirectory));
  process.env.TEST_FIXTURE_MODE=mode;process.env.HASHBROWN_PACKAGE_REACT_URL='http://127.0.0.1:4431';process.env.HASHBROWN_PACKAGE_ANGULAR_URL='http://127.0.0.1:4432';
  process.env.HASHBROWN_PACKAGE_EVIDENCE_DIRECTORY=mode==='source'?path.join(root,'unused-missing-package-directory'):privateRoot;
  if(mode==='historical')process.env.HASHBROWN_UPGRADE_EVIDENCE_DIRECTORY=privateRoot;else delete process.env.HASHBROWN_UPGRADE_EVIDENCE_DIRECTORY;
  await assert.rejects(()=>withDotnetFixture('openai',async()=>assert.fail('failed startup must never reach use')),/exited 7/);
  const added=(await fs.readdir(sourceDirectory)).filter(name=>!before.has(name));
  try {
   if(mode==='source'){assert.equal(added.length,1);assert.ok((await fs.readFile(path.join(sourceDirectory,added[0]),'utf8')).includes('PRIVATE_FIXTURE_OUTPUT_SENTINEL'));}
   else {assert.equal(added.length,0,'raw package/old-worker output cannot reach source diagnostics upload');const files=await v.listFiles(privateRoot);assert.equal(files.length,1);assert.ok((await fs.readFile(path.join(privateRoot,files[0]),'utf8')).includes('PRIVATE_FIXTURE_OUTPUT_SENTINEL'));}
  }finally{for(const name of added)await fs.rm(path.join(sourceDirectory,name));}
 }
}finally{for(const key of Object.keys(process.env))if(!(key in originalEnvironment))delete process.env[key];Object.assign(process.env,originalEnvironment);await fs.rm(root,{recursive:true,force:true});}
`);

  expect(result.trim()).toBe('passed');
});
