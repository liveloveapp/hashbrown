import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../../..');

/** Reads complete pinned package identities from a project or documented XML. */
const packages = (text) =>
  [
    ...text.matchAll(
      /<PackageReference Include="([^"]+)" Version="([^"]+)"\s*\/>/g,
    ),
  ]
    .map((match) => `${match[1]}@${match[2]}`)
    .sort();

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
    blocks[0].length !== 2 ||
    JSON.stringify(blocks[0]) !== JSON.stringify(blocks[1])
  )
    throw new Error(
      'Native framework recipes must contain the same two tested C# examples.',
    );
  const locked = packages(
    readFileSync(
      join(workspace, 'tools/conformance/dotnet/Hashbrown.Conformance.csproj'),
      'utf8',
    ),
  );
  if (
    locked.length === 0 ||
    texts.some(
      (text) => JSON.stringify(packages(text)) !== JSON.stringify(locked),
    )
  )
    throw new Error(
      'Native recipe pins must match the complete locked reference project.',
    );
  return blocks[0];
}

/** Replaces one verified insertion target without silently compiling a different example. */
const replaceOnce = (text, target, replacement) => {
  if (text.split(target).length !== 2)
    throw new Error(`Expected one native recipe target: ${target}`);
  return text.replace(target, replacement);
};

/** Builds exact documented programs for every provider, API and optional recovery insertion. */
export function nativeRecipePrograms([bootstrap, recoveryBlock]) {
  return ['openai', 'azure'].flatMap((provider) =>
    ['responses', 'chat-completions'].flatMap((api) =>
      [false, true].map((recovery) => {
        let program = replaceOnce(
          bootstrap,
          'builder.Configuration["ModelApi"] ??= "responses";',
          `builder.Configuration["ModelApi"] = "${api}";\nbuilder.Configuration["Provider"] = "${provider}";`,
        );
        if (recovery)
          program = replaceOnce(
            program,
            'await app.RunAsync();',
            `${recoveryBlock}\n\nawait app.RunAsync();`,
          );
        return { provider, api, recovery, program };
      }),
    ),
  );
}

/** Compiles documented programs against an isolated copy of the actual locked Integration source. */
export function compileNativeRecipes() {
  const variants = nativeRecipePrograms(readNativeRecipes());
  const directory = mkdtempSync(
    join(tmpdir(), 'hashbrown-dotnet-native-recipe-'),
  );
  try {
    for (const name of [
      'global.json',
      'nuget.config',
      'Hashbrown.Conformance.csproj',
      'packages.lock.json',
      'Integration',
    ])
      cpSync(join(source, name), join(directory, name), { recursive: true });
    execFileSync(
      process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
      ['restore', '--locked-mode'],
      { cwd: directory, stdio: 'inherit' },
    );
    for (const { provider, api, recovery, program } of variants) {
      console.log(
        `Compiling native ${provider} ${api} recipe, recovery=${recovery}`,
      );
      writeFileSync(join(directory, 'Program.cs'), program);
      execFileSync(
        process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
        ['build', '--no-restore'],
        { cwd: directory, stdio: 'inherit' },
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  compileNativeRecipes();
