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

test('production HTML references a built favicon', async () => {
  const html = await readFile(
    new URL('index.html', deploymentDirectory),
    'utf8',
  );

  const faviconPath = html.match(
    /<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["'](\/[^"']+)["'])[^>]*>/,
  )?.[1];
  const faviconExists = faviconPath
    ? await stat(new URL(faviconPath.slice(1), deploymentDirectory)).then(
        (favicon) => favicon.isFile(),
        () => false,
      )
    : false;

  assert.equal(faviconExists, true);
});

test('production worker renders dynamic pages with built client assets', async () => {
  const worker = (
    await import(new URL('_worker.js/index.js', deploymentDirectory))
  ).default;
  const routes = [
    {
      path: '/docs/angular/start/quick',
      expectedContent: 'Angular Quick Start',
    },
    {
      path: '/blog/2026-07-09-hashbrown-v-0-5-0',
      expectedContent:
        'Hashbrown v0.5 makes generative UI easier to build, stream, and reuse',
    },
  ];
  const environment = {
    ASSETS: {
      fetch: async () => new Response('Not found', { status: 404 }),
    },
  };
  const context = { waitUntil: () => undefined };

  const responses = await Promise.all(
    routes.map(({ path }) =>
      worker.fetch(
        new Request(new URL(path, 'https://hashbrown.dev')),
        environment,
        context,
      ),
    ),
  );
  const pages = await Promise.all(
    responses.map(async (response, index) => ({
      expectedContent: routes[index].expectedContent,
      html: await response.text(),
      status: response.status,
    })),
  );

  for (const page of pages) {
    const moduleScript = page.html.match(
      /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>/,
    );

    assert.equal(page.status, 200);
    assert.ok(moduleScript);
    assert.match(moduleScript[1], /^\/assets\/[^"']+\.js$/);
    assert.equal(
      (
        await stat(new URL(moduleScript[1].slice(1), deploymentDirectory))
      ).isFile(),
      true,
    );
    assert.match(page.html, new RegExp(page.expectedContent));
    assert.doesNotMatch(page.html, /\/src\/(?:main\.ts|styles\.css)/);
  }
});

test('production worker does not render internal code examples as content routes', async () => {
  const worker = (
    await import(new URL('_worker.js/index.js', deploymentDirectory))
  ).default;

  const response = await worker.fetch(
    new Request(
      'https://hashbrown.dev/getting-started/angular/generative-ui/app',
    ),
    {
      ASSETS: {
        fetch: async () => new Response('Not found', { status: 404 }),
      },
    },
    { waitUntil: () => undefined },
  );
  const html = await response.text();

  assert.doesNotMatch(html, /exposeComponent\(LoginViewComponent/);
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
