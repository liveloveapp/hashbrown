import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'vite';

const require = createRequire(import.meta.url);
const { Architect } = require('@angular-devkit/architect');
const {
  WorkspaceNodeModulesArchitectHost,
} = require('@angular-devkit/architect/node');
const { logging } = require('@angular-devkit/core');
const root = process.cwd();
const ids = new Set();

await build({
  configFile: false,
  root: root + '/react',
  build: { outDir: root + '/dist/react', emptyOutDir: true },
  plugins: [
    {
      name: 'candidate-origins',
      moduleParsed(module) {
        ids.add(module.id);
      },
    },
  ],
});
await fs.writeFile(
  'react-module-ids.json',
  JSON.stringify([...ids].sort(), null, 2),
);
const logger = new logging.Logger('candidate');
logger.subscribe((entry) => console.log(entry.message));
const workspaceHost = {
  getBuilderName: async () => '@angular/build:application',
  getMetadata: async () => ({
    root: 'angular',
    sourceRoot: 'angular/src',
    projectType: 'application',
    cli: { cache: { enabled: false } },
  }),
  getOptions: async () => ({
    browser: 'angular/src/main.ts',
    index: 'angular/src/index.html',
    tsConfig: 'angular/tsconfig.json',
    outputPath: 'dist/angular',
    optimization: false,
    sourceMap: false,
    statsJson: true,
    progress: false,
  }),
  hasTarget: async () => true,
  getDefaultConfigurationName: async () => undefined,
};
const architect = new Architect(
  new WorkspaceNodeModulesArchitectHost(workspaceHost, root),
);
const task = await architect.scheduleTarget(
  { project: 'candidate', target: 'build' },
  {},
  { logger },
);
try {
  if (!(await task.result).success)
    throw Error('Candidate Angular build failed');
} finally {
  await task.stop();
}
