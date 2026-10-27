import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = process.cwd();
const page = (sdk) =>
  resolve(root, `www/content/docs/${sdk}/platform/dotnet-native-tools.md`);
const csharp = (text) =>
  [...text.matchAll(/```csharp\n([\s\S]*?)\n```/g)].map((match) => match[1]);
const packages = (text) =>
  [
    ...text.matchAll(
      /<PackageReference Include="([^"]+)" Version="([^"]+)"\s*\/>/g,
    ),
  ]
    .map((match) => `${match[1]}@${match[2]}`)
    .sort();

test('publishes identical native examples and the complete locked package set', () => {
  const project = readFileSync(
    resolve(root, 'tools/conformance/dotnet/Hashbrown.Conformance.csproj'),
    'utf8',
  );

  assert.ok(existsSync(page('react')), 'React native guide must exist');
  assert.ok(existsSync(page('angular')), 'Angular native guide must exist');
  const react = readFileSync(page('react'), 'utf8');
  const angular = readFileSync(page('angular'), 'utf8');

  assert.equal(csharp(react).length, 2);
  assert.deepEqual(csharp(react), csharp(angular));
  assert.deepEqual(packages(react), packages(project));
  assert.deepEqual(packages(angular), packages(project));
});

test('bootstraps authenticated PostgreSQL native composition from exact registered schemas', () => {
  assert.ok(existsSync(page('react')), 'Native bootstrap must be documented');
  const [program] = csharp(readFileSync(page('react'), 'utf8'));

  for (const required of [
    'AddAuthentication(',
    'RequireAuthenticatedUser()',
    'ClaimTypes.NameIdentifier',
    'CookieSecurePolicy.Always',
    'ServerConfigurationIdentity.Create(builder.Configuration)',
    'function.JsonSchema',
    'await journal.InitializeAsync();',
    'NativeSessionEndpointConfiguration.Configure(',
    'NativeSessionAgentFactory.Create(',
    'NativeSessionEndpointConfiguration.Map(',
    'await using var nativeSource',
    'ProviderFactory.Create(builder.Configuration)',
  ])
    assert.ok(
      program.includes(required),
      `Missing production bootstrap: ${required}`,
    );
  assert.ok(
    program.indexOf('await journal.InitializeAsync();') <
      program.indexOf('builder.Build()'),
  );
  assert.ok(
    !/Fixture|X-Test|local-fixture|EnableInvocableFunctionBypassing/.test(
      program,
    ),
  );
});

test('native verifier checks actual recipes and compiles all eight provider API recovery combinations', async () => {
  const path = resolve(
    root,
    'tools/conformance/dotnet/verify-native-recipe.mjs',
  );
  assert.ok(existsSync(path), 'Native compiled verifier must exist');
  const { readNativeRecipes, nativeRecipePrograms } = await import(path);

  const recipes = readNativeRecipes(root);
  const variants = nativeRecipePrograms(recipes);

  assert.equal(variants.length, 8);
  assert.equal(
    new Set(
      variants.map(
        ({ provider, api, recovery }) => `${provider}/${api}/${recovery}`,
      ),
    ).size,
    8,
  );
  for (const variant of variants) {
    assert.ok(
      variant.program.includes(
        `builder.Configuration["Provider"] = "${variant.provider}";`,
      ),
    );
    assert.equal(
      variant.program.includes(
        'NativeSessionRecoveryEndpointConfiguration.MapRecovery(',
      ),
      variant.recovery,
    );
    assert.ok(variant.program.includes('NativeSessionAgentFactory.Create('));
  }
});

test('documents pending reload and operator authority without claiming native approvals', () => {
  const text = readFileSync(page('react'), 'utf8');
  const [, recovery] = csharp(text);

  assert.ok(
    text.includes('`NativePendingBrowserResults` with **no snapshot**'),
  );
  assert.ok(text.includes('Native MAF approvals'));
  assert.ok(text.includes('unsupported by this composition'));
  assert.ok(text.includes('external-quiescence'));
  assert.ok(text.includes('permanent selector tombstones'));
  assert.ok(text.includes('0.8.2 or later'));
  assert.ok(recovery.includes('["isolation"] = scope'));
  assert.ok(recovery.includes('FindAll("native-session-scope")'));
  assert.ok(
    recovery.includes(
      'NativeSessionRecoveryEndpointConfiguration.MapOperations(',
    ),
  );
});

test('keeps native routes discoverable and baseline recipe blocks unchanged in count', () => {
  const project = JSON.parse(
    readFileSync(
      resolve(root, 'tools/conformance/dotnet/project.json'),
      'utf8',
    ),
  );
  const menu = readFileSync(
    resolve(root, 'www/src/components/menus/docs-menu.data.ts'),
    'utf8',
  );

  for (const sdk of ['react', 'angular']) {
    const baseline = readFileSync(
      resolve(root, `www/content/docs/${sdk}/platform/dotnet.md`),
      'utf8',
    );
    assert.equal(csharp(baseline).length, 4);
    assert.ok(baseline.includes(`/docs/${sdk}/platform/dotnet-native-tools`));
    assert.ok(
      project.namedInputs.default.includes(
        `{workspaceRoot}/www/content/docs/${sdk}/platform/dotnet-native-tools.md`,
      ),
    );
  }
  assert.ok(menu.includes("path: 'platform/dotnet-native-tools'"));
  assert.deepEqual(project.targets['check-docs'].options.commands, [
    'node --test tools/conformance/dotnet/native-recipe.test.mjs',
    'node tools/conformance/dotnet/verify-recipe.mjs',
    'node tools/conformance/dotnet/verify-native-recipe.mjs',
  ]);
  assert.equal(project.targets['check-docs'].options.parallel, false);
});
