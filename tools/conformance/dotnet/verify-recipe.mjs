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
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../../..');
const replaceExactlyOnce = (text, target, replacement) => {
  if (text.split(target).length !== 2)
    throw new Error(`Expected exactly one recipe insertion target: ${target}`);
  return text.replace(target, replacement);
};
const blocks = (sdk) =>
  [
    ...readFileSync(
      join(root, `www/content/docs/${sdk}/platform/dotnet.md`),
      'utf8',
    ).matchAll(/```csharp\n([\s\S]*?)\n```/g),
  ].map((match) => match[1]);
const react = blocks('react');
if (
  react.length !== 4 ||
  JSON.stringify(react) !== JSON.stringify(blocks('angular'))
)
  throw new Error(
    'Both framework recipes must contain the same four tested server examples.',
  );
const directory = mkdtempSync(join(tmpdir(), 'hashbrown-dotnet-recipe-'));
try {
  for (const name of [
    'global.json',
    'nuget.config',
    'Hashbrown.Conformance.csproj',
    'packages.lock.json',
    'Integration',
  ])
    cpSync(join(source, name), join(directory, name), { recursive: true });
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
          console.log(
            `Compiling ${api} ${durable ? 'PostgreSQL' : 'memory'} recipe, confirmation=${confirmation}, recovery=${recovery}`,
          );
          writeFileSync(join(directory, 'Program.cs'), program);
          execFileSync('dotnet', ['restore', '--locked-mode'], {
            cwd: directory,
            stdio: 'inherit',
          });
          execFileSync('dotnet', ['build', '--no-restore'], {
            cwd: directory,
            stdio: 'inherit',
          });
        }
      }
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
