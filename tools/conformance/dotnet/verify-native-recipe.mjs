import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  validateRecipePackage,
  compileRecipes,
  metadataArgument,
} from './nuget-consumer/recipes.mjs';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../../..');

/** Extracts exact native C# examples, rejecting framework drift or dependency substitutions. */
export function readNativeRecipes(workspace = root) {
  const texts = ['react', 'angular'].map((sdk) =>
    readFileSync(
      join(
        workspace,
        `www/content/docs/${sdk}/platform/dotnet-native-tools.md`,
      ),
      'utf8',
    ),
  );
  const blocks = texts.map((text) =>
    [...text.matchAll(/```csharp\n([\s\S]*?)\n```/g)].map((match) => match[1]),
  );
  if (
    blocks[0].length !== 3 ||
    JSON.stringify(blocks[0]) !== JSON.stringify(blocks[1])
  )
    throw new Error(
      'Native framework recipes must contain the same three tested C# examples.',
    );
  texts.forEach(validateRecipePackage);
  return blocks[0];
}

/** Replaces one verified insertion target without silently compiling a different example. */
const replaceOnce = (text, target, replacement) => {
  if (text.split(target).length !== 2)
    throw new Error(`Expected one native recipe target: ${target}`);
  return text.replace(target, replacement);
};

const registration =
  'var functions = new[] { AIFunctionFactory.Create(LookupAirport, "lookupAirport") };\nvar catalog = new NativeToolCatalog(functions.Select(function =>\n    new NativeToolDefinition(function.Name, 1, function.JsonSchema)));';

/** Builds every documented provider/API program with optional approvals and recovery. */
export function nativeRecipePrograms([
  bootstrap,
  approvalRegistration,
  recoveryBlock,
]) {
  return ['openai', 'azure'].flatMap((provider) =>
    ['responses', 'chat-completions'].flatMap((api) =>
      [false, true].flatMap((recovery) =>
        [false, true].map((approvals) => {
          let program = replaceOnce(
            bootstrap,
            'builder.Configuration["ModelApi"] ??= "responses";',
            `builder.Configuration["ModelApi"] = "${api}";\nbuilder.Configuration["Provider"] = "${provider}";`,
          );
          if (approvals)
            program = replaceOnce(program, registration, approvalRegistration);
          if (recovery)
            program = replaceOnce(
              program,
              'await app.RunAsync();',
              `${recoveryBlock}\n\nawait app.RunAsync();`,
            );
          return { provider, api, recovery, approvals, program };
        }),
      ),
    ),
  );
}

/** Compiles the sixteen native programs using mandatory immutable candidate metadata. */
export async function compileNativeRecipes(metadata) {
  await compileRecipes(
    nativeRecipePrograms(readNativeRecipes()),
    metadata,
    'native',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await compileNativeRecipes(metadataArgument());
