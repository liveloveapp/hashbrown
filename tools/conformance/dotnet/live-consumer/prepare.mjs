import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  validateManifest,
  validateSourceImports,
  validateIsolation,
} from './verify.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../..');
const allowlist = {
  react: [
    'plain-smoke.tsx',
    'structured-smoke.tsx',
    'ui-smoke.tsx',
    'interrupt-controls.tsx',
    'recovery-controls.ts',
    'recovery.ts',
    'styles.css',
  ],
  angular: [
    'recovery.ts',
    'styles.css',
    'index.html',
    'app/plain-smoke.ts',
    'app/structured-smoke.ts',
    'app/ui-smoke.ts',
    'app/interrupt-controls.ts',
    'app/recovery-controls.ts',
  ],
};

/** Supplies build processes only OS context, without inherited provider credentials. */
export function buildEnvironment(environment) {
  return Object.fromEntries(
    ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'LANG']
      .filter((key) => environment[key])
      .map((key) => [key, environment[key]]),
  );
}

/** Runs installation and building with a restricted environment. */
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: buildEnvironment(process.env),
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0)
    throw Error(`Consumer ${command} failed (${result.status ?? 'spawn'})`);
}

/** Creates a fresh isolated consumer; --directory specifies an existing OS-temp parent. */
export async function prepareConsumer(parent = os.tmpdir()) {
  const actualParent = await fs.realpath(parent);
  const temporaryRoot = await fs.realpath(os.tmpdir());
  if (
    actualParent !== temporaryRoot &&
    !actualParent.startsWith(temporaryRoot + path.sep)
  )
    throw Error('Consumer parent must be inside OS temp');
  validateIsolation(actualParent, repository);
  const root = await fs.mkdtemp(
    path.join(actualParent, 'hashbrown-live-consumer-'),
  );
  try {
    validateManifest(
      JSON.parse(await fs.readFile(path.join(here, 'package.json'), 'utf8')),
    );
    for (const file of ['package.json', 'package-lock.json', 'verify.mjs'])
      await fs.copyFile(path.join(here, file), path.join(root, file));
    await fs.cp(path.join(here, 'templates'), path.join(root, 'templates'), {
      recursive: true,
    });
    for (const [framework, files] of Object.entries(allowlist)) {
      const templates =
        framework === 'react'
          ? { 'app.tsx': 'react-app.tsx', 'main.tsx': 'react-main.tsx' }
          : { 'app/app.ts': 'angular-app.ts', 'main.ts': 'angular-main.ts' };
      const closure = [...files, ...Object.keys(templates)].map(
        (file) => 'src/' + file,
      );
      for (const file of [...files, ...Object.keys(templates)]) {
        const source = templates[file]
          ? path.join(here, 'templates', templates[file])
          : path.join(
              repository,
              'tools/conformance/hosts',
              framework,
              'src',
              file,
            );
        if ((await fs.lstat(source)).isSymbolicLink())
          throw Error('Source symlinks are forbidden');
        const text = await fs.readFile(source, 'utf8');
        if (/\.tsx?$/.test(file))
          validateSourceImports('src/' + file, text, closure);
        const destination = path.join(root, framework, 'src', file);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, text);
      }
      const compilerOptions = {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        ...(framework === 'react'
          ? { jsx: 'react-jsx', types: ['vite/client'] }
          : {
              experimentalDecorators: true,
              useDefineForClassFields: false,
              types: [],
            }),
      };
      await fs.writeFile(
        path.join(root, framework, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions,
          ...(framework === 'angular'
            ? { angularCompilerOptions: { strictTemplates: true } }
            : {}),
          include: ['src'],
        }),
      );
    }
    await fs.writeFile(
      path.join(root, 'react/index.html'),
      '<!doctype html><html><head><meta charset="UTF-8"><title>Published React consumer</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    );
    await fs.writeFile(path.join(root, 'build.mjs'), buildScript);
    run(
      'npm',
      [
        'ci',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--registry=https://registry.npmjs.org',
      ],
      root,
    );
    console.log('Typechecking the published React consumer');
    run(
      process.execPath,
      [
        'node_modules/typescript/bin/tsc',
        '--noEmit',
        '-p',
        'react/tsconfig.json',
      ],
      root,
    );
    run(process.execPath, ['build.mjs'], root);
    const { verifyConsumer } = await import(
      pathToFileURL(path.join(root, 'verify.mjs')).href
    );
    return await verifyConsumer(root, repository);
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}

const buildScript = `
import {build} from 'vite';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Architect}=require('@angular-devkit/architect');
const {WorkspaceNodeModulesArchitectHost}=require('@angular-devkit/architect/node');
const {logging}=require('@angular-devkit/core');
const root=process.cwd();const ids=new Set();
await build({configFile:false,root:root+'/react',build:{outDir:root+'/dist/react',emptyOutDir:true},plugins:[{name:'capture-origins',moduleParsed(m){ids.add(m.id)}}]});
await fs.writeFile('react-module-ids.json',JSON.stringify([...ids].sort(),null,2));
const logger=new logging.Logger('consumer');logger.subscribe(e=>console.log(e.message));
const workspaceHost={getBuilderName:async()=> '@angular/build:application',getMetadata:async()=>({root:'angular',sourceRoot:'angular/src',projectType:'application',cli:{cache:{enabled:false}}}),getOptions:async()=>({browser:'angular/src/main.ts',index:'angular/src/index.html',tsConfig:'angular/tsconfig.json',outputPath:'dist/angular',styles:['angular/src/styles.css'],optimization:false,sourceMap:false,statsJson:true,progress:false}),hasTarget:async()=>true,getDefaultConfigurationName:async()=>undefined};
const architect=new Architect(new WorkspaceNodeModulesArchitectHost(workspaceHost,root));
const run=await architect.scheduleTarget({project:'consumer',target:'build'},{},{logger});
try{const result=await run.result;if(!result.success)throw Error('Angular consumer build failed');}finally{await run.stop()}
`;
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const flag = process.argv.indexOf('--directory');
  const parent =
    flag >= 0
      ? process.argv[flag + 1]
      : process.env.HASHBROWN_LIVE_CONSUMER_DIR;
  if (flag >= 0 && !parent)
    throw Error('--directory requires an OS-temp parent');
  const report = await prepareConsumer(parent);
  console.log(
    JSON.stringify({
      directory: report.directory,
      metadataPath: report.metadataPath,
      artifacts: report.artifacts,
    }),
  );
}
