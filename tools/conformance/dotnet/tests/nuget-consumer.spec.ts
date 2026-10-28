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
