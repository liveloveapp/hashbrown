import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const deploymentDirectory = new URL(
  '../../../dist/www/analog/',
  import.meta.url,
);

test('production build creates a deployable Cloudflare Pages artifact', async () => {
  const artifactStats = await Promise.all([
    stat(new URL('_worker.js/index.js', deploymentDirectory)),
    stat(new URL('index.html', deploymentDirectory)),
  ]);

  assert.equal(
    artifactStats.every((artifact) => artifact.isFile()),
    true,
  );
});

test('Wrangler deploys the production build directory', async () => {
  const config = await readFile(
    new URL('../wrangler.toml', import.meta.url),
    'utf8',
  );
  const outputDirectory = config.match(
    /^pages_build_output_dir\s*=\s*"([^"]+)"$/m,
  )?.[1];
  const configuredDirectory = new URL(
    `${outputDirectory}/`,
    new URL('../', import.meta.url),
  );

  assert.equal(configuredDirectory.href, deploymentDirectory.href);
  assert.match(config, /^compatibility_flags\s*=\s*\["nodejs_compat"\]$/m);
});

test('production build generates the Wrangler deployment config', async () => {
  const redirectDirectory = new URL('../.wrangler/deploy/', import.meta.url);
  const redirect = JSON.parse(
    await readFile(new URL('config.json', redirectDirectory), 'utf8'),
  );
  const generatedConfigUrl = new URL(redirect.configPath, redirectDirectory);
  const generatedConfig = JSON.parse(
    await readFile(generatedConfigUrl, 'utf8'),
  );
  const generatedOutputDirectory = new URL(
    `${generatedConfig.pages_build_output_dir}/`,
    generatedConfigUrl,
  );

  assert.equal(generatedConfig.name, 'hashbrown-www');
  assert.deepEqual(generatedConfig.compatibility_flags, ['nodejs_compat']);
  assert.equal(generatedOutputDirectory.href, deploymentDirectory.href);
});

test('Nx deploys the prebuilt worker with the Wrangler config', async () => {
  const project = JSON.parse(
    await readFile(new URL('../project.json', import.meta.url), 'utf8'),
  );

  assert.equal(
    project.targets.deploy.options.command,
    'npx wrangler --cwd=www/analog pages deploy ../../dist/www/analog --project-name=hashbrown-www --commit-dirty=true --no-bundle',
  );
});
