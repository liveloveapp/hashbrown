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
const blocks = (sdk) =>
  [
    ...readFileSync(
      join(root, `www/content/docs/${sdk}/platform/dotnet.md`),
      'utf8',
    ).matchAll(/```csharp\n([\s\S]*?)\n```/g),
  ].map((match) => match[1]);
const react = blocks('react');
if (
  react.length !== 2 ||
  JSON.stringify(react) !== JSON.stringify(blocks('angular'))
)
  throw new Error(
    'Both framework recipes must contain the same two tested server examples.',
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
  for (const confirmation of [false, true]) {
    let program = react[0];
    if (confirmation) {
      program = program
        .replace(
          'HashbrownEndpointConfiguration.Map(',
          `${react[1]}\n\nHashbrownEndpointConfiguration.Map(`,
        )
        .replace(
          'app, "/run", agent, pending, Scope,',
          'app, "/run", confirmedAgent, pending, Scope,',
        );
    }
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
} finally {
  rmSync(directory, { recursive: true, force: true });
}
