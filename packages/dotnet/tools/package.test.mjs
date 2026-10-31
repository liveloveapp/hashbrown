import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  writeFileSync,
  cpSync,
  rmSync,
  mkdirSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('library project exists independently of the executable host', () => {
  const project = resolve(root, 'Hashbrown.AspNetCore.csproj');

  assert.ok(existsSync(project), 'missing distributable library project');
  const xml = readFileSync(project, 'utf8');
  assert.match(xml, /Microsoft.NET.Sdk"/);
  assert.match(xml, /<TargetFramework>net10\.0<\/TargetFramework>/);
  assert.doesNotMatch(
    xml,
    /<TargetFrameworks>|<OutputType>(?:Exe|WinExe)<\/OutputType>/,
  );
  assert.match(xml, /<PackageId>Hashbrown\.AspNetCore<\/PackageId>/);
  assert.match(xml, /<Version>0\.1\.0-preview\.1<\/Version>/);
});

test('package provides library, XML, reference, symbols and ASP.NET framework metadata', async () => {
  const artifacts = resolve(root, '../../dist/packages/dotnet');

  assert.ok(
    existsSync(
      resolve(artifacts, 'Hashbrown.AspNetCore.0.1.0-preview.1.nupkg'),
    ),
    'missing NuGet artifact',
  );
  const { verifyPackage } = await import('./verify-package.mjs');
  verifyPackage(artifacts);
});

test('packaged README gives release-ready exact NuGet.org installation without stale publication claims', () => {
  const archive = resolve(
    root,
    '../../dist/packages/dotnet/Hashbrown.AspNetCore.0.1.0-preview.1.nupkg',
  );

  const readme = execFileSync('unzip', ['-p', archive, 'README.md'], {
    encoding: 'utf8',
  });

  assert.doesNotMatch(readme, /not published to NuGet\.org/i);
  assert.doesNotMatch(
    readme,
    /\b(?:is|has been)\s+(?:published|available)\s+(?:to|on|from)\s+NuGet\.org/i,
  );
  assert.ok(readme.includes('Version `0.1.0-preview.1` is a prerelease.'));
  assert.ok(
    readme.includes(
      'dotnet add package Hashbrown.AspNetCore --version "[0.1.0-preview.1]" --source https://api.nuget.org/v3/index.json',
    ),
  );
  assert.ok(
    readme.includes(
      '<PackageReference Include="Hashbrown.AspNetCore" Version="[0.1.0-preview.1]" />',
    ),
  );
  assert.ok(
    readme.includes(
      'dotnet restore --source https://api.nuget.org/v3/index.json --use-lock-file',
    ),
  );
  assert.ok(
    readme.includes(
      'dotnet restore --source https://api.nuget.org/v3/index.json --locked-mode',
    ),
  );
  assert.ok(readme.includes('unpublished CI candidate'));
  assert.equal(readme, readFileSync(resolve(root, 'README.md'), 'utf8'));
});

test('API verifier rejects contract mutations', async () => {
  assert.ok(
    existsSync(resolve(root, 'tools/verify-package.mjs')),
    'missing API verifier',
  );
  const { compareApi } = await import('./verify-package.mjs');
  const baseline = {
    types: [
      {
        name: 'Example',
        members: ['M(default=1,name=value)', 'enum=1', 'generic:class'],
      },
    ],
  };

  compareApi(baseline, structuredClone(baseline));
  for (const replacement of [
    'M(default=2,name=value)',
    'M(default=1,name=other)',
    'enum=2',
    'generic:struct',
  ]) {
    const changed = structuredClone(baseline);
    changed.types[0].members[
      replacement.startsWith('M') ? 0 : replacement.startsWith('enum') ? 1 : 2
    ] = replacement;
    assert.throws(() => compareApi(baseline, changed), /API/);
  }
  assert.throws(() => compareApi(baseline, { types: [] }), /API/);
  assert.throws(
    () =>
      compareApi(baseline, {
        types: [...baseline.types, { name: 'Leak', members: [] }],
      }),
    /API/,
  );
});

test('XML coverage requires authored members and permits synthesized record members', async () => {
  const { verifyXmlDocumentation } = await import('./verify-package.mjs');
  const xml =
    '<doc><members><member name="T:Example"><summary>Type.</summary></member><member name="M:Example.Run"><summary>Runs.</summary></member></members></doc>';
  const authored = ['T:Example', 'M:Example.Run'];

  assert.equal(
    typeof verifyXmlDocumentation,
    'function',
    'missing authored XML coverage verifier',
  );
  verifyXmlDocumentation(xml, authored);
  assert.throws(
    () =>
      verifyXmlDocumentation(
        xml.replace('name="M:Example.Run"', 'name="M:Example.ToString"'),
        authored,
      ),
    /XML/,
  );
});

test('SDK extractor preserves real contract metadata and rejects namespace leaks', async () => {
  const { compareApi } = await import('./verify-package.mjs');
  const directory = mkdtempSync(resolve(tmpdir(), 'hashbrown-api-contract-'));
  const tool = resolve(root, 'tools/bin/Release/net10.0/ApiSnapshot.dll');
  const fixture = `#nullable enable
using System;
namespace Hashbrown.AspNetCore {
public enum Decision { Approved = 1, Declined = 2 }
public interface IOperation<out T> { T Read(); }
public class Parent { }
public class Contract<T> : Parent, IOperation<T> where T : class, new() {
  public Contract(int capacity = 3) { }
  public T Read() => new();
  public string? Label { get; set; } = null!;
  public string? Option { get; init; }
  public event EventHandler? Changed { add { } remove { } }
  public const int Limit = 5;
  public U Convert<U>(ref int version, out string? message, string name = "original", Decision decision = Decision.Approved) where U : struct { message = null; return default; }
  public class Nested { }
}
public record Item(string Name);
internal class Hidden { public void Secret() { } }
}
`;
  const capture = (source, expectFailure = false) => {
    writeFileSync(resolve(directory, 'Contract.cs'), source);
    execFileSync(
      'dotnet',
      [
        'build',
        'Fixture.csproj',
        '--no-restore',
        '--verbosity',
        'quiet',
        '-p:UseSharedCompilation=false',
      ],
      { cwd: directory, stdio: 'pipe' },
    );
    const snapshot = spawnSync(
      'dotnet',
      [
        tool,
        resolve(directory, 'bin/Debug/net10.0/Fixture.dll'),
        'Hashbrown.AspNetCore',
        resolve(directory, 'api.json'),
      ],
      { cwd: directory, encoding: 'utf8' },
    );
    if (expectFailure) {
      assert.notEqual(
        snapshot.status,
        0,
        'exported test namespace must be rejected by the actual extractor',
      );
      assert.match(snapshot.stderr, /exported namespace/);
      return;
    }
    assert.equal(snapshot.status, 0, snapshot.stderr);
    return JSON.parse(readFileSync(resolve(directory, 'api.json'), 'utf8'));
  };

  try {
    cpSync(resolve(root, 'global.json'), resolve(directory, 'global.json'));
    cpSync(resolve(root, 'nuget.config'), resolve(directory, 'nuget.config'));
    writeFileSync(
      resolve(directory, 'Fixture.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable></PropertyGroup></Project>',
    );
    execFileSync(
      'dotnet',
      [
        'restore',
        'Fixture.csproj',
        '-p:NuGetAudit=false',
        '--verbosity',
        'quiet',
      ],
      { cwd: directory, stdio: 'pipe' },
    );
    const baseline = capture(fixture);
    const contract = baseline.types.find((type) =>
      type.name.startsWith('Hashbrown.AspNetCore.Contract`1<'),
    );
    const serialized = baseline.types
      .flatMap((type) => type.members)
      .join('\n');

    assert.equal(contract.baseType, 'Hashbrown.AspNetCore.Parent');
    assert.ok(
      contract.interfaces.some((type) =>
        type.startsWith('Hashbrown.AspNetCore.IOperation`1<'),
      ),
    );
    assert.match(contract.generics, /ReferenceTypeConstraint/);
    assert.match(contract.generics, /DefaultConstructorConstraint/);
    assert.match(serialized, /capacity[^"\n]*default=3/);
    assert.match(serialized, /name[^\n]*default="original"/);
    assert.match(serialized, /System\.Int32& version in=False out=False/);
    assert.match(
      serialized,
      /!!0:U/,
      'method generic parameters must retain their scope',
    );
    assert.match(serialized, /message in=False out=True/);
    assert.match(serialized, /NotNullableValueTypeConstraint/);
    assert.match(serialized, /Label[^"\n]*Nullable\/Nullable/);
    assert.match(serialized, /Approved value=1/);
    assert.match(
      serialized,
      /set_Option[^\n]*modreq\(System\.Runtime\.CompilerServices\.IsExternalInit\)/,
      'init-only setter modifier must be captured',
    );
    assert.ok(baseline.types.some((type) => type.name.includes('+Nested')));
    assert.ok(!baseline.types.some((type) => type.name.includes('Hidden')));
    const record = baseline.types.find(
      (type) => type.name === 'Hashbrown.AspNetCore.Item',
    );
    assert.ok(record.members.some((member) => member.includes('<Clone>$')));
    assert.ok(record.members.some((member) => member.includes('Deconstruct')));
    const mutations = [
      fixture.replace('capacity = 3', 'capacity = 4'),
      fixture.replace('string name =', 'string renamed ='),
      fixture.replace('Declined = 2', 'Declined = 7'),
      fixture.replace('where U : struct', 'where U : unmanaged'),
      fixture.replace('ref int version', 'in int version'),
      fixture.replace('where T : class, new()', 'where T : struct'),
      fixture.replace('string? Label', 'string Label'),
      fixture.replace('public class Nested { }', ''),
      fixture.replace('public const int Limit = 5;', ''),
      fixture.replace(
        'public const int Limit = 5;',
        'public const int Limit = 5; public int Extra;',
      ),
      fixture.replace('Option { get; init; }', 'Option { get; set; }'),
      fixture.replace('internal class Hidden', 'public class Hidden'),
    ];
    for (const mutation of mutations)
      assert.throws(
        () => compareApi(baseline, capture(mutation)),
        /API/,
        'actual extractor omitted changed contract metadata',
      );
    capture(
      fixture +
        'namespace Hashbrown.Conformance.Testing { public class Leak { } }',
      true,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('package rejects an additional target framework payload', async () => {
  const { verifyPackage } = await import('./verify-package.mjs');
  const directory = mkdtempSync(
    resolve(tmpdir(), 'hashbrown-package-framework-'),
  );
  const artifacts = resolve(root, '../../dist/packages/dotnet');

  try {
    for (const file of [
      'Hashbrown.AspNetCore.0.1.0-preview.1.nupkg',
      'Hashbrown.AspNetCore.0.1.0-preview.1.snupkg',
      'public-api.json',
    ])
      cpSync(resolve(artifacts, file), resolve(directory, file));
    mkdirSync(resolve(directory, 'lib/net9.0'), { recursive: true });
    writeFileSync(
      resolve(directory, 'lib/net9.0/Extra.dll'),
      'unexpected framework',
    );
    execFileSync(
      'zip',
      [
        '-q',
        'Hashbrown.AspNetCore.0.1.0-preview.1.nupkg',
        'lib/net9.0/Extra.dll',
      ],
      { cwd: directory },
    );

    assert.throws(() => verifyPackage(directory), /only net10\.0/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
