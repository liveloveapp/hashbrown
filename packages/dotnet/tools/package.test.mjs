import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  realpathSync,
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

test('packed candidate supports the immutable optional browser recovery public contract', () => {
  const directory = mkdtempSync(
    resolve(tmpdir(), 'hashbrown-browser-recovery-contract-'),
  );
  const artifacts = resolve(root, '../../dist/packages/dotnet');
  const archive = resolve(
    artifacts,
    'Hashbrown.AspNetCore.0.1.0-preview.1.nupkg',
  );
  const reference = resolve(
    root,
    'obj/Release/net10.0/ref/Hashbrown.AspNetCore.dll',
  );
  const runtime = execFileSync('unzip', [
    '-p',
    archive,
    'lib/net10.0/Hashbrown.AspNetCore.dll',
  ]);
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const referenceHash = hash(readFileSync(reference));
  const runtimeHash = hash(runtime);

  assert.equal(
    runtimeHash,
    hash(
      readFileSync(
        resolve(root, 'bin/Release/net10.0/Hashbrown.AspNetCore.dll'),
      ),
    ),
    'packed candidate must match the reviewed build runtime',
  );

  try {
    const hintPath = reference
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('"', '&quot;');
    writeFileSync(
      resolve(directory, 'Consumer.csproj'),
      `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><FrameworkReference Include="Microsoft.AspNetCore.App"/><Reference Include="Hashbrown.AspNetCore"><HintPath>${hintPath}</HintPath><Private>true</Private></Reference></ItemGroup></Project>`,
    );
    writeFileSync(
      resolve(directory, 'Program.cs'),
      String.raw`
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Hashbrown.AspNetCore;

static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
static void Reject(Action action) { try { action(); } catch (ArgumentException) { return; } throw new Exception("Invalid public contract value was accepted."); }
var original = new NativeBrowserRecoveryOutcome("browser", "result");
var outcomes = new[] { original };
var request = new NativeBrowserRecoveryRequest(1, 7, outcomes);
outcomes[0] = new("changed", "unavailable");
var ids = new[] { "browser" };
var capability = new PendingBrowserRecovery(1, 7, ids);
var status = new NativeSessionStatus(200) { BrowserRecoveryCallIds = ids };
ids[0] = "changed";
Check(request.ProtocolVersion == 1 && request.ServerRevision == 7 && request.Outcomes[0].ToolCallId == "browser" && request.Outcomes[0].Status == "result", "Request must retain copied immutable descriptors.");
Check(capability.CallIds[0] == "browser" && status.BrowserRecoveryCallIds![0] == "browser" && ((IList<string>)capability.CallIds).IsReadOnly && ((IList<NativeBrowserRecoveryOutcome>)request.Outcomes).IsReadOnly, "Capability/status/outcomes must own read-only copies.");
Reject(() => new NativeBrowserRecoveryOutcome("", "result"));
Reject(() => new NativeBrowserRecoveryOutcome("browser", "retry"));
Reject(() => new NativeBrowserRecoveryRequest(2, 7, [original]));
Reject(() => new NativeBrowserRecoveryRequest(1, 0, [original]));
Reject(() => new NativeBrowserRecoveryRequest(1, 9007199254740992L, [original]));
Reject(() => new NativeBrowserRecoveryRequest(1, 7, []));
Reject(() => new NativeBrowserRecoveryRequest(1, 7, [original, original]));
Reject(() => new NativeBrowserRecoveryRequest(1, 7, Enumerable.Range(0, 257).Select(index => new NativeBrowserRecoveryOutcome("call-" + index, "result")).ToArray()));
Reject(() => new PendingBrowserRecovery(1, 7, ["browser", "browser"]));
Reject(() => new PendingBrowserRecovery(1, 7, []));
Reject(() => new PendingBrowserRecovery(1, -1, ["browser"]));
var snapshot = new ConversationSnapshot("thread", JsonSerializer.SerializeToElement(Array.Empty<object>()), null) { PendingBrowserRecovery = capability };
var (thread, messages, state, interrupts, system) = snapshot;
var (code, rowState, generation, revision, publicRequest, leaseUntil, isNew, completed, pending, reason) = status;
Check(thread == "thread" && messages.GetArrayLength() == 0 && state is null && interrupts is null && system is null && code == 200 && rowState is null && generation == 0 && revision == 0 && publicRequest is null && leaseUntil is null && !isNew && !completed && pending is null && reason is null, "Existing positional constructors and Deconstruct signatures must remain available.");
Check(typeof(NativeSessionStatus).GetProperty(nameof(NativeSessionStatus.BrowserRecoveryCallIds))!.SetMethod!.ReturnParameter.GetRequiredCustomModifiers().Contains(typeof(IsExternalInit)) && typeof(ConversationSnapshot).GetProperty(nameof(ConversationSnapshot.PendingBrowserRecovery))!.SetMethod!.ReturnParameter.GetRequiredCustomModifiers().Contains(typeof(IsExternalInit)), "Optional snapshot/status additions must be init-only.");
Check(typeof(INativeSessionJournal).GetMethods().Length == 21 && typeof(INativeSessionBrowserRecoveryJournal).GetInterfaces().Contains(typeof(INativeSessionJournal)), "Existing journal stays unchanged while capability remains optional.");
var legacy = DispatchProxy.Create<INativeSessionJournal, ConsumerJournal>();
var capable = DispatchProxy.Create<INativeSessionBrowserRecoveryJournal, ConsumerJournal>();
Check(legacy is not INativeSessionBrowserRecoveryJournal, "An old journal must not acquire capability.");
var raw = "  {\"threadId\":\"thread\",\"resume\":[],\"forwardedProps\":{\"hashbrown\":{\"recovery\":{\"version\":1,\"serverRevision\":7,\"outcomes\":[{\"toolCallId\":\"browser\",\"status\":\"result\"}]}}}}\n";
var key = new NativeSessionKey("agent", "scope", "thread", new Dictionary<string, string> { ["isolation"] = "scope" });
var refusal = await capable.TryAcquireBrowserRecoveryAsync(key, raw, request);
var observed = (ConsumerJournal)(object)capable;
Check(refusal.Status == 409 && refusal.Lease is null && observed.Calls == 1 && observed.Raw == raw && ReferenceEquals(observed.Request, request) && ReferenceEquals(observed.Key, key), "Optional method must preserve original raw/typed/key arguments and bounded refusal without ordinary fallback.");
var serialized = JsonSerializer.SerializeToElement(snapshot, JsonSerializerOptions.Web);
Check(serialized.GetProperty("pendingBrowserRecovery").GetProperty("protocolVersion").GetInt32() == 1 && serialized.GetProperty("pendingBrowserRecovery").GetProperty("serverRevision").GetInt64() == 7 && serialized.GetProperty("pendingBrowserRecovery").GetProperty("callIds")[0].GetString() == "browser", "Public capability JSON must retain the exact V1 inner contract.");
Console.WriteLine(JsonSerializer.Serialize(new { runtimePath = typeof(NativeBrowserRecoveryRequest).Assembly.Location, copiedCollections = true, constructorLimits = true, initOnly = true, optionalInterface = true, preservedPositionalContracts = true, originalArgumentPassThrough = true }));

public class ConsumerJournal : DispatchProxy
{
    public int Calls { get; private set; }
    public string? Raw { get; private set; }
    public NativeSessionKey? Key { get; private set; }
    public NativeBrowserRecoveryRequest? Request { get; private set; }
    protected override object? Invoke(MethodInfo? method, object?[]? args)
    {
        if (method!.Name != nameof(INativeSessionBrowserRecoveryJournal.TryAcquireBrowserRecoveryAsync)) throw new Exception("Unexpected ordinary journal call.");
        Calls++; Key = (NativeSessionKey)args![0]!; Raw = (string)args[1]!; Request = (NativeBrowserRecoveryRequest)args[2]!;
        return ValueTask.FromResult(new NativeSessionAdmission(409));
    }
}
`,
    );
    const output = resolve(directory, 'out');
    const dotnet = process.env['DOTNET_HOST_PATH'] ?? 'dotnet';
    execFileSync(
      dotnet,
      [
        'build',
        resolve(directory, 'Consumer.csproj'),
        '--nologo',
        '--verbosity',
        'quiet',
        '--output',
        output,
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    );
    const executedRuntime = resolve(output, 'Hashbrown.AspNetCore.dll');
    writeFileSync(executedRuntime, runtime);

    const result = JSON.parse(
      execFileSync(dotnet, [resolve(output, 'Consumer.dll')], {
        encoding: 'utf8',
      }),
    );

    assert.equal(
      realpathSync(result.runtimePath),
      realpathSync(executedRuntime),
      'consumer must execute the extracted packed candidate',
    );
    assert.equal(hash(readFileSync(executedRuntime)), runtimeHash);
    assert.equal(
      hash(readFileSync(reference)),
      referenceHash,
      'reference assembly must remain immutable during consumer execution',
    );
    for (const check of [
      'copiedCollections',
      'constructorLimits',
      'initOnly',
      'optionalInterface',
      'preservedPositionalContracts',
      'originalArgumentPassThrough',
    ])
      assert.equal(result[check], true, check);
    const proof = {
      packageSha256: hash(readFileSync(archive)),
      referenceSha256: referenceHash,
      packedRuntimeSha256: runtimeHash,
      checks: result,
    };
    writeFileSync(
      resolve(artifacts, 'browser-recovery-contract-proof.json'),
      JSON.stringify(proof, null, 2) + '\n',
    );
    console.log(
      'Packed browser recovery public contract passed: ' +
        JSON.stringify(proof),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
