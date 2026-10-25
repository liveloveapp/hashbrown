/** Prepares, installs and builds the disposable Threadplane consumers sequentially. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildInstalledThreadplaneConsumer,
  prepareThreadplaneConsumer,
  selectThreadplaneConsumerSdks,
  threadplaneConsumerInstallArgs,
  verifyThreadplaneSourceCheckout,
} from './docs-threadplane-consumers';

const { values } = parseArgs({
  options: { sdk: { type: 'string', default: 'all' } },
  strict: true,
  allowPositionals: false,
});
const sdks = selectThreadplaneConsumerSdks(values.sdk);
const workRoot = resolve('dist/docs-threadplane');
if (sdks.includes('react')) {
  const evidence = verifyThreadplaneSourceCheckout();
  mkdirSync(workRoot, { recursive: true });
  writeFileSync(
    resolve(workRoot, 'source-verification.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}

for (const sdk of sdks) {
  const consumer = prepareThreadplaneConsumer(sdk);
  const installation = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    threadplaneConsumerInstallArgs(sdk),
    {
      cwd: consumer.root,
      stdio: 'inherit',
      env: { ...process.env, NODE_PATH: '' },
    },
  );
  if (installation.error) throw installation.error;
  if (installation.status !== 0)
    throw new Error(
      `${sdk} consumer installation failed (${installation.status ?? installation.signal}).`,
    );
  const result = await buildInstalledThreadplaneConsumer(sdk);
  console.log(JSON.stringify({ sdk, ...result }, null, 2));
}
