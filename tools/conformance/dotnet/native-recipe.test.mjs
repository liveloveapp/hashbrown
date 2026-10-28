import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { resolve, join, dirname } from 'node:path';

const root = process.cwd();
/** Resolves the native guide for a framework. */
const page = (sdk) =>
  resolve(root, `www/content/docs/${sdk}/platform/dotnet-native-tools.md`);
/** Extracts every fenced C# example in document order. */
const csharp = (text) =>
  [...text.matchAll(/```csharp\n([\s\S]*?)\n```/g)].map((match) => match[1]);
/** Reads the complete package identity set. */
const packages = (text) =>
  [
    ...text.matchAll(
      /<PackageReference Include="([^"]+)" Version="([^"]+)"\s*\/>/g,
    ),
  ]
    .map((match) => `${match[1]}@${match[2]}`)
    .sort();

test('publishes identical native examples with exactly the candidate package', () => {
  const project = readFileSync(
    resolve(root, 'tools/conformance/dotnet/Hashbrown.Conformance.csproj'),
    'utf8',
  );

  assert.ok(existsSync(page('react')), 'React native guide must exist');
  assert.ok(existsSync(page('angular')), 'Angular native guide must exist');
  const react = readFileSync(page('react'), 'utf8');
  const angular = readFileSync(page('angular'), 'utf8');

  assert.equal(csharp(react).length, 3);
  assert.deepEqual(csharp(react), csharp(angular));
  assert.deepEqual(packages(react), ['Hashbrown.AspNetCore@[0.1.0-preview.1]']);
  assert.deepEqual(packages(angular), packages(react));
  assert.ok(project.includes('ProjectReference'));
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

/** Matches the original eight-program generator independently of the approval dimension. */
const originalPrograms = ([bootstrap, , recoveryBlock]) =>
  ['openai', 'azure'].flatMap((provider) =>
    ['responses', 'chat-completions'].flatMap((api) =>
      [false, true].map((recovery) => ({
        provider,
        api,
        recovery,
        program: bootstrap
          .replace(
            'builder.Configuration["ModelApi"] ??= "responses";',
            `builder.Configuration["ModelApi"] = "${api}";\nbuilder.Configuration["Provider"] = "${provider}";`,
          )
          .replace(
            'await app.RunAsync();',
            recovery
              ? `${recoveryBlock}\n\nawait app.RunAsync();`
              : 'await app.RunAsync();',
          ),
      })),
    ),
  );

test('checks sixteen native tuples and retains the original eight exact programs', async () => {
  const { readNativeRecipes, nativeRecipePrograms } =
    await import('./verify-native-recipe.mjs');
  const recipes = readNativeRecipes(root);

  const variants = nativeRecipePrograms(recipes);

  assert.equal(variants.length, 16);
  assert.equal(
    new Set(
      variants.map(
        ({ provider, api, recovery, approvals }) =>
          `${provider}/${api}/${recovery}/${approvals}`,
      ),
    ).size,
    16,
  );
  assert.deepEqual(
    variants
      .filter(({ approvals }) => !approvals)
      .map(({ provider, api, recovery, program }) => ({
        provider,
        api,
        recovery,
        program,
      })),
    originalPrograms(recipes),
  );
  for (const provider of ['openai', 'azure'])
    for (const api of ['responses', 'chat-completions'])
      for (const recovery of [false, true])
        for (const approvals of [false, true])
          assert.equal(
            variants.filter(
              (variant) =>
                variant.provider === provider &&
                variant.api === api &&
                variant.recovery === recovery &&
                variant.approvals === approvals,
            ).length,
            1,
          );
});

test('composes the genuine wrapper and matching catalog only for protected variants', async () => {
  const { readNativeRecipes, nativeRecipePrograms } =
    await import('./verify-native-recipe.mjs');
  const recipes = readNativeRecipes(root);
  const [, approval, recovery] = recipes;

  const variants = nativeRecipePrograms(recipes);

  assert.match(approval, /new ApprovalRequiredAIFunction\(/);
  assert.match(
    approval,
    /function.Name, 1, function.JsonSchema, RequiresConfirmation: true/,
  );
  assert.doesNotMatch(approval, /function.JsonSchema,\s*true/);
  assert.ok(recovery.includes('["isolation"] = scope'));
  assert.ok(recovery.includes('FindAll("native-session-scope")'));
  assert.ok(
    recovery.includes(
      'NativeSessionRecoveryEndpointConfiguration.MapOperations(',
    ),
  );
  for (const {
    provider,
    api,
    approvals,
    recovery: hasRecovery,
    program,
  } of variants) {
    assert.equal(
      program.split('new ApprovalRequiredAIFunction(').length - 1,
      approvals ? 1 : 0,
    );
    assert.equal(
      program.split('RequiresConfirmation: true').length - 1,
      approvals ? 1 : 0,
    );
    assert.equal(
      program.includes(
        'new NativeToolDefinition(function.Name, 1, function.JsonSchema)',
      ),
      !approvals,
    );
    assert.equal(program.includes(recovery), hasRecovery);
    assert.ok(
      program.includes(`builder.Configuration["Provider"] = "${provider}";`),
    );
    assert.ok(
      program.includes(`builder.Configuration["ModelApi"] = "${api}";`),
    );
    for (const marker of [
      'await app.RunAsync();',
      'var catalog =',
      'NativeSessionAgentFactory.Create(',
      'NativeSessionEndpointConfiguration.Configure(',
      'NativeSessionEndpointConfiguration.Map(',
    ])
      assert.equal(program.split(marker).length - 1, 1);
    for (const marker of [
      'AddAuthentication(',
      'RequireAuthenticatedUser()',
      'ClaimTypes.NameIdentifier',
      'CookieSecurePolicy.Always',
      'ProviderFactory.Create(builder.Configuration)',
      'builder.Services, AgentName, journal, catalog, Scope, limits',
      'client, AgentName, functions, catalog,',
    ])
      assert.ok(program.includes(marker), marker);
    assert.ok(
      program.indexOf('await journal.InitializeAsync();') <
        program.indexOf('builder.Build()'),
    );
    assert.ok(
      program.indexOf('await journal.InitializeAsync();') <
        program.indexOf('NativeSessionEndpointConfiguration.Map('),
    );
    assert.doesNotMatch(
      program,
      /Fixture|X-Test|local-fixture|Candidate|Reflection|BindingFlags/,
    );
  }
  for (const block of recipes)
    assert.doesNotMatch(
      block,
      /Fixture|X-Test|local-fixture|Candidate|Reflection|BindingFlags/,
    );
});

test('rejects absent or ambiguous composition anchors rather than compiling a substitute', async () => {
  const { readNativeRecipes, nativeRecipePrograms } =
    await import('./verify-native-recipe.mjs');
  const [bootstrap, approval, recovery] = readNativeRecipes(root);
  const registration =
    'var functions = new[] { AIFunctionFactory.Create(LookupAirport, "lookupAirport") };\nvar catalog = new NativeToolCatalog(functions.Select(function =>\n    new NativeToolDefinition(function.Name, 1, function.JsonSchema)));';
  const targets = [
    registration,
    'builder.Configuration["ModelApi"] ??= "responses";',
    'await app.RunAsync();',
  ];

  const malformed = targets.flatMap((target) => [
    bootstrap.replace(target, ''),
    `${bootstrap}\n${target}`,
  ]);

  for (const program of malformed)
    assert.throws(
      () => nativeRecipePrograms([program, approval, recovery]),
      /Expected one native recipe target/,
    );
});

test('rejects missing extra drifted or malformed blocks and dependency substitutions', async () => {
  const { readNativeRecipes } = await import('./verify-native-recipe.mjs');
  const text = readFileSync(page('react'), 'utf8');
  const project = readFileSync(
    resolve(root, 'tools/conformance/dotnet/Hashbrown.Conformance.csproj'),
    'utf8',
  );
  const variants = [
    text.replace(/```csharp\n[\s\S]*?\n```/, ''),
    `${text}\n\n\`\`\`csharp\nextra\n\`\`\``,
    text.replace('```csharp', '```cs'),
    text.replace('Version="[0.1.0-preview.1]"', 'Version="999.0.0"'),
  ];
  const temporary = mkdtempSync(join(tmpdir(), 'native-recipe-test-'));

  try {
    for (const [index, changed] of [
      ...variants,
      text.replace('var functions =', 'var changedFunctions ='),
    ].entries()) {
      const workspace = join(temporary, String(index));
      for (const sdk of ['react', 'angular']) {
        const file = join(
          workspace,
          `www/content/docs/${sdk}/platform/dotnet-native-tools.md`,
        );
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(
          file,
          sdk === 'react' ? changed : index === 4 ? text : changed,
        );
      }
      const file = join(
        workspace,
        'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
      );
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, project);

      assert.throws(
        () => readNativeRecipes(workspace),
        /three tested C# examples|Recipe must reference exactly the candidate package/,
      );
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('documents native decisions recovery and permanent failure boundaries', () => {
  const texts = ['react', 'angular'].map((sdk) =>
    readFileSync(page(sdk), 'utf8'),
  );

  for (const text of texts) {
    for (const phrase of [
      'complete decision batch',
      'admitted atomically',
      '{approved: true}',
      '{approved: false}',
      '`cancelled` with no payload',
      'Cancelled by caller.',
      'native false approval',
      'distinct `Cancelled`',
      'never enter their registered executor',
      'failure cannot reopen',
      'at most one owned executor dispatch',
      'not exactly-once external effects',
      'original raw request',
      'every native partition',
      'fresh local batch token',
      'recovery lookup and restoration perform no model',
      'PendingMixedBrowserResult',
      '**no snapshot**',
      'disable sends and decision controls',
      'new-thread',
      'original browser handler does not execute',
      'fresh browser call with a fresh ID',
      'native schema 2',
      'schema1 workers',
      'workflow checkpoint schema3',
      'permanent selector',
      'consumed-decision',
      '128 live/private payloads',
      '4096 total selectors',
      'model request may already have occurred',
      'before model work',
      'NativePendingBrowserResults',
      'external-quiescence',
      '0.8.2 or later',
    ])
      assert.ok(
        text.includes(phrase),
        `Missing native safety explanation: ${phrase}`,
      );
    assert.doesNotMatch(
      text,
      /unsupported by this composition|native approval transport is a later milestone|milestone.two live.*passed/i,
    );
  }
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
  assert.equal(
    project.targets['check-docs'].options.command,
    'node tools/conformance/dotnet/verify-recipe.mjs --all',
  );
  assert.equal(project.targets['check-docs'].cache, false);
});

test('documents package consumption on all four routes without implementation fallback or public availability claims', () => {
  for (const sdk of ['react', 'angular'])
    for (const name of ['dotnet', 'dotnet-native-tools']) {
      const text = readFileSync(
        resolve(root, `www/content/docs/${sdk}/platform/${name}.md`),
        'utf8',
      );

      assert.deepEqual(packages(text), [
        'Hashbrown.AspNetCore@[0.1.0-preview.1]',
      ]);
      assert.ok(text.includes('using Hashbrown.AspNetCore;'));
      assert.ok(text.includes('not published to NuGet.org'));
      assert.doesNotMatch(
        text,
        /Hashbrown.Conformance.Integration|<ProjectReference|<HintPath|Copy the C# files|This is a source recipe|available on NuGet.org/i,
      );
    }
});

test('compiler verifiers require metadata and remove copied implementation mode', () => {
  for (const name of ['verify-recipe.mjs', 'verify-native-recipe.mjs']) {
    const text = readFileSync(
      resolve(root, 'tools/conformance/dotnet', name),
      'utf8',
    );

    assert.ok(text.includes('metadata'));
    assert.doesNotMatch(
      text,
      /cpSync|['"]Integration['"]|Hashbrown.Conformance.csproj/,
    );
  }
});

test('standard recipes retain sixteen distinct identities and reject ambiguous anchors', async () => {
  const { readRecipes, recipePrograms } = await import('./verify-recipe.mjs');
  const recipes = readRecipes(root);

  const variants = recipePrograms(recipes);

  assert.equal(variants.length, 16);
  assert.equal(
    new Set(
      variants.map(
        ({ api, durable, confirmation, recovery }) =>
          `${api}/${durable}/${confirmation}/${recovery}`,
      ),
    ).size,
    16,
  );
  for (const target of [
    'builder.Configuration["ModelApi"] ??= "responses";',
    'await app.RunAsync();',
    'HashbrownEndpointConfiguration.Map(',
    'IInterruptStore pending = new PendingInterruptStore(TimeProvider.System, registry, checkpointOptions);',
  ])
    for (const changed of [
      recipes[0].replace(target, ''),
      `${recipes[0]}\n${target}`,
    ])
      assert.throws(
        () => recipePrograms([changed, ...recipes.slice(1)]),
        /Expected exactly one recipe insertion target/,
      );
});

test('artifact compiler commands reject missing and changed metadata before building', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'recipe-metadata-test-'));
  const metadata = join(temporary, 'candidate.json');
  writeFileSync(metadata, '{}');
  writeFileSync(metadata + '.sha256', '0'.repeat(64));

  try {
    for (const name of ['verify-recipe.mjs', 'verify-native-recipe.mjs'])
      for (const args of [[], [`--metadata=${metadata}`]]) {
        const result = spawnSync(
          process.execPath,
          [resolve(root, 'tools/conformance/dotnet', name), ...args],
          { encoding: 'utf8' },
        );

        assert.notEqual(result.status, 0);
        assert.match(
          result.stderr,
          /Absolute --metadata is required|Pointer anchor differs/,
        );
      }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('rejects docs that claim public NuGet availability during local qualification', async () => {
  const { validateRecipePackage } = await import('./verify-recipe.mjs');
  const text = readFileSync(page('react'), 'utf8');

  assert.throws(
    () =>
      validateRecipePackage(
        text.replace('not published to NuGet.org', 'available on NuGet.org'),
      ),
    /Local artifact must remain unpublished/,
  );
});

test('combined CLI reaches mandatory metadata validation without an import deadlock', () => {
  if (process.env['HASHBROWN_DOCS_CLI_TEST_CHILD']) return;
  const metadata = join(
    mkdtempSync(join(tmpdir(), 'recipe-cli-test-')),
    'missing.json',
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, 'tools/conformance/dotnet/verify-recipe.mjs'),
        '--all',
        `--metadata=${metadata}`,
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, HASHBROWN_DOCS_CLI_TEST_CHILD: '1' },
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT/);
    assert.doesNotMatch(result.stderr, /unsettled top-level await/);
  } finally {
    rmSync(dirname(metadata), { recursive: true, force: true });
  }
});
