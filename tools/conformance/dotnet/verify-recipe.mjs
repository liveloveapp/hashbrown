import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  validateRecipePackage,
  compileRecipes,
  metadataArgument,
} from './nuget-consumer/recipes.mjs';
export { validateRecipePackage } from './nuget-consumer/recipes.mjs';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../../..');
const replaceExactlyOnce = (text, target, replacement) => {
  if (text.split(target).length !== 2)
    throw new Error(`Expected exactly one recipe insertion target: ${target}`);
  return text.replace(target, replacement);
};

/** Reads framework-identical standard recipes with the exact package contract. */
export function readRecipes(workspace = root) {
  const blocks = ['react', 'angular'].map((sdk) => {
    const text = readFileSync(
      join(workspace, `www/content/docs/${sdk}/platform/dotnet.md`),
      'utf8',
    );
    validateRecipePackage(text);
    return [...text.matchAll(/```csharp\n([\s\S]*?)\n```/g)].map(
      (match) => match[1],
    );
  });
  assert.equal(blocks[0].length, 4, 'Four standard recipes required');
  assert.deepEqual(blocks[0], blocks[1], 'Standard framework recipes differ');
  return blocks[0];
}

/** Generates all sixteen exact standard program identities. */
export function recipePrograms(react) {
  const variants = [];
  for (const api of ['responses', 'chat-completions']) {
    for (const durable of [false, true]) {
      for (const confirmation of [false, true]) {
        for (const recovery of [false, true]) {
          let program = replaceExactlyOnce(
            react[0],
            'builder.Configuration["ModelApi"] ??= "responses";',
            `builder.Configuration["ModelApi"] = "${api}";`,
          );
          if (durable)
            program = replaceExactlyOnce(
              program,
              'IInterruptStore pending = new PendingInterruptStore(TimeProvider.System, registry, checkpointOptions);',
              react[2],
            );
          if (confirmation) {
            program = replaceExactlyOnce(
              program,
              'HashbrownEndpointConfiguration.Map(',
              `${react[1]}\n\nHashbrownEndpointConfiguration.Map(`,
            );
            program = replaceExactlyOnce(
              program,
              'app, "/run", agent, pending, Scope,',
              'app, "/run", confirmedAgent, pending, Scope,',
            );
          }
          if (recovery)
            program = replaceExactlyOnce(
              program,
              'await app.RunAsync();',
              `${react[3]}\n\nawait app.RunAsync();`,
            );
          variants.push({ api, durable, confirmation, recovery, program });
        }
      }
    }
  }
  return variants;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const metadata = metadataArgument();
  if (process.argv.includes('--all'))
    execFileSync(
      process.execPath,
      ['--test', join(source, 'native-recipe.test.mjs')],
      { stdio: 'inherit' },
    );
  if (process.argv.includes('--all')) {
    const { readNativeRecipes, nativeRecipePrograms } =
      await import('./verify-native-recipe.mjs');
    await compileRecipes(
      [
        ...recipePrograms(readRecipes()).map((variant) => ({
          kind: 'standard',
          ...variant,
        })),
        ...nativeRecipePrograms(readNativeRecipes()).map((variant) => ({
          kind: 'native',
          ...variant,
        })),
      ],
      metadata,
      'all',
    );
  } else {
    await compileRecipes(recipePrograms(readRecipes()), metadata, 'standard');
  }
}
