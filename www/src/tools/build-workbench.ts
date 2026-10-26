import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { build as bundle } from 'esbuild';

const work = resolve('dist/docs-workbench');
const compiled = resolve('dist/docs-quickstart/compiled');
mkdirSync(work, { recursive: true });
mkdirSync(resolve(work, 'public/fonts'), { recursive: true });
for (const name of [
  'HankenGrotesk-Regular.ttf',
  'HankenGrotesk-SemiBold.ttf',
  'JetBrainsMono-Regular.ttf',
  'OFL.txt',
]) {
  cpSync(
    resolve('www/src/lib/og/fonts', name),
    resolve(work, 'public/fonts', name),
  );
}
for (const framework of ['react', 'angular']) {
  const entry =
    framework === 'react'
      ? `import React from 'react';import {createRoot} from 'react-dom/client';import {HashbrownProvider} from '@hashbrownai/react';import {Workbench} from ${JSON.stringify(resolve(compiled, 'react/src/Workbench.js'))};createRoot(document.getElementById('root')).render(React.createElement(HashbrownProvider,{url:'/api/workbench/chat',telemetry:false},React.createElement(Workbench)));`
      : `import '@angular/compiler';import{bootstrapApplication}from'@angular/platform-browser';import{provideZonelessChangeDetection}from'@angular/core';import{provideHashbrown}from'@hashbrownai/angular';import{Workbench}from${JSON.stringify(resolve(compiled, 'angular/src/app/workbench.js'))};bootstrapApplication(Workbench,{providers:[provideZonelessChangeDetection(),provideHashbrown({baseUrl:'/api/workbench/chat',telemetry:false})]}).catch(console.error);`;
  writeFileSync(
    resolve(work, `${framework}-entry.js`),
    `import ${JSON.stringify(resolve('www/examples/quickstart/runtime/workbench.css'))};${entry}`,
  );
  writeFileSync(
    resolve(work, `${framework}.html`),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hashbrown workbench · ${framework}</title><style>@font-face{font-family:'Hanken Grotesk';src:url('/fonts/HankenGrotesk-Regular.ttf')}@font-face{font-family:'Hanken Grotesk';font-weight:600;src:url('/fonts/HankenGrotesk-SemiBold.ttf')}@font-face{font-family:'JetBrains Mono';src:url('/fonts/JetBrainsMono-Regular.ttf')}body{margin:0}</style></head><body><div id="root"></div><app-workbench></app-workbench><script type="module" src="/${framework}-entry.js"></script></body></html>`,
  );
}
await build({
  configFile: false,
  root: work,
  publicDir: resolve(work, 'public'),
  resolve: {
    alias: Object.fromEntries(
      ['core', 'react', 'angular'].map((pkg) => [
        `@hashbrownai/${pkg}`,
        resolve(`dist/packages/${pkg}`),
      ]),
    ),
  },
  build: {
    outDir: resolve(work, 'browser'),
    emptyOutDir: true,
    rollupOptions: {
      input: ['react', 'angular'].map((name) => resolve(work, `${name}.html`)),
    },
  },
});
await bundle({
  entryPoints: {
    'verify-workbench': 'www/src/tools/verify-workbench.ts',
    'workbench-server': 'www/examples/quickstart/server/workbench-server.ts',
  },
  outdir: resolve(work, 'node'),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  target: 'node22',
  alias: {
    '@hashbrownai/core': resolve('packages/core/src/index.ts'),
    '@hashbrownai/typesafe': resolve('packages/typesafe/src/index.ts'),
    '@hashbrownai/openai': resolve('packages/openai/src/index.ts'),
    '#development-install': resolve(
      'packages/core/src/growth/development-install.default.ts',
    ),
  },
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
