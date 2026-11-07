import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tool = resolve(root, 'tools/bin/Release/net10.0/ApiSnapshot.dll');
const assembly = resolve(root, 'bin/Release/net10.0/Hashbrown.AspNetCore.dll');
const xml = resolve(root, 'bin/Release/net10.0/Hashbrown.AspNetCore.xml');
const reviewed = resolve(root, 'api/public-api.json');
const committed = resolve(root, 'api/reference-docs.json');

function generate(dll, docs, baseline, output, check = false) {
  return spawnSync(
    'dotnet',
    [
      tool,
      check ? '--reference-check' : '--reference',
      dll,
      'Hashbrown.AspNetCore',
      docs,
      baseline,
      output,
    ],
    { encoding: 'utf8' },
  );
}

function requireSuccess(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

/** Convert the reviewed snapshot's CLR type spelling to a compiler XML type ID. */
function xmlType(name) {
  return name
    .replace(/!!(\d+):\w+/g, (_, index) => String.fromCharCode(96, 96) + index)
    .replace(/!(\d+):\w+/g, (_, index) => String.fromCharCode(96) + index)
    .replace(/\x60\d+</g, '{')
    .replaceAll('>', '}')
    .replaceAll('+', '.')
    .replaceAll('&', '@')
    .replace(
      /\[(,+)\]/g,
      (_, commas) =>
        '[' +
        Array(commas.length + 1)
          .fill('0:')
          .join(',') +
        ']',
    );
}

/** Reconstruct public XML identities independently from the reviewed ABI grammar. */
function reviewedXmlIds(abi) {
  return abi.types.flatMap((type) => {
    const owner = type.name.split('<')[0].replaceAll('+', '.');
    return [
      'T:' + owner,
      ...type.members.map((member) => {
        if (!member.startsWith('method ')) {
          const kind = member.split(' ')[0];
          const pattern =
            kind === 'property'
              ? / ([^\s(]+)\(/
              : kind === 'field'
                ? / ([^\s]+) value=/
                : / ([^\s]+) add=/;
          const match = member.match(pattern);
          assert.ok(match, 'Unrecognized reviewed member: ' + member);
          return (
            { property: 'P:', field: 'F:', event: 'E:' }[kind] +
            owner +
            '.' +
            match[1]
          );
        }
        const begin = member.indexOf('>(');
        assert.ok(begin > 0, 'Missing reviewed parameters: ' + member);
        let genericStart = begin;
        let brackets = 1;
        while (genericStart > 0) {
          genericStart--;
          if (member[genericStart] === '>') brackets++;
          if (member[genericStart] === '<' && --brackets === 0) break;
        }
        assert.equal(brackets, 0, 'Unbalanced reviewed generic marker');
        const nameStart = member.lastIndexOf(' ', genericStart - 1) + 1;
        const methodName = member.slice(nameStart, genericStart);
        assert.ok(methodName, 'Missing reviewed method name');
        let end = begin + 2;
        let parentheses = 1;
        for (; end < member.length; end++) {
          if (member[end] === '(') parentheses++;
          if (member[end] === ')' && --parentheses === 0) break;
        }
        const list = member.slice(begin + 2, end);
        const parts = [];
        let depth = 0;
        let start = 0;
        for (let index = 0; index < list.length; index++) {
          if ('<[('.includes(list[index])) depth++;
          if ('>])'.includes(list[index])) depth--;
          if (list[index] === ',' && depth === 0) {
            parts.push(list.slice(start, index));
            start = index + 1;
          }
        }
        if (list.length) parts.push(list.slice(start));
        const parameters = parts.map((parameter) =>
          xmlType(parameter.split(' ')[0]),
        );
        const generic = member.slice(genericStart + 1, begin);
        const name = methodName === '.ctor' ? '#ctor' : methodName;
        return (
          'M:' +
          owner +
          '.' +
          name +
          (generic
            ? String.fromCharCode(96, 96) + generic.split(';').length
            : '') +
          (parameters.length ? '(' + parameters.join(',') + ')' : '')
        );
      }),
    ];
  });
}

test('reviewed identity parsing preserves compiler-generated angle brackets in method names', () => {
  const abi = {
    types: [
      {
        name: 'Hashbrown.AspNetCore.CheckpointAudit',
        members: [
          'method Public, HideBySig <Clone>$<>():Hashbrown.AspNetCore.CheckpointAudit nullable=NotNull/NotNull[]',
        ],
      },
    ],
  };

  const ids = reviewedXmlIds(abi);

  assert.deepEqual(ids, [
    'T:Hashbrown.AspNetCore.CheckpointAudit',
    'M:Hashbrown.AspNetCore.CheckpointAudit.<Clone>$',
  ]);
});

test('committed reference covers reviewed exported types and authored XML identities', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'hashbrown-reference-'));

  try {
    const output = resolve(directory, 'reference.json');
    requireSuccess(generate(assembly, xml, reviewed, output));
    const bytes = readFileSync(output, 'utf8');
    const reference = JSON.parse(bytes);
    const abi = JSON.parse(readFileSync(reviewed, 'utf8'));
    const authored = JSON.parse(
      readFileSync(resolve(root, 'api/documented-members.json'), 'utf8'),
    );
    const ids = reference.types.flatMap((type) => [
      type.id,
      ...type.members.map((member) => member.id),
    ]);

    assert.equal(reference.schemaVersion, 1);
    assert.deepEqual(reference.package, {
      id: 'Hashbrown.AspNetCore',
      version: '0.1.0-preview.2',
      status: 'unreleased',
    });
    assert.equal(reference.types.length, 73);
    assert.deepEqual(
      reference.types.map((type) => type.name).sort(),
      abi.types.map((type) => type.name).sort(),
    );
    const publicIds = new Set(reviewedXmlIds(abi));
    const authoredPublic = authored.filter((id) => publicIds.has(id));

    assert.deepEqual([...ids].sort(), authoredPublic.sort());
    assert.ok(!ids.includes('T:Hashbrown.AspNetCore.NativeSessionContext'));
    assert.ok(!ids.includes('T:Hashbrown.AspNetCore.NativeApprovalAgent'));
    assert.equal(new Set(ids).size, ids.length);
    assert.doesNotMatch(
      bytes,
      /HideBySig|BeforeFieldInit|ReadState|WriteState|nullable=|<Clone>\$/,
    );
    assert.doesNotMatch(
      bytes,
      /"(?:generatedAt|timestamp|commitSha|repositoryCommit)"\s*:|\/Users\/|[A-Z]:\\/,
    );
    assert.equal(
      bytes,
      readFileSync(committed, 'utf8'),
      'Committed reference is stale',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('freshness rejects missing and modified generated input without rewriting it', () => {
  const directory = mkdtempSync(
    resolve(tmpdir(), 'hashbrown-reference-check-'),
  );

  try {
    const output = resolve(directory, 'reference.json');
    const missing = generate(assembly, xml, reviewed, output, true);
    requireSuccess(generate(assembly, xml, reviewed, output));
    requireSuccess(generate(assembly, xml, reviewed, output, true));
    const changed = readFileSync(output, 'utf8').replace(
      'unreleased',
      'published',
    );
    writeFileSync(output, changed);
    const stale = generate(assembly, xml, reviewed, output, true);

    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr + missing.stdout, /missing|generate/i);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr + stale.stdout, /stale|fresh|regenerate/i);
    assert.equal(readFileSync(output, 'utf8'), changed);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('compiled XML preserves readable overloads, authored prose and cross references deterministically', () => {
  const directory = mkdtempSync(
    resolve(tmpdir(), 'hashbrown-reference-fixture-'),
  );
  const source = [
    'namespace Hashbrown.AspNetCore;',
    '/// <summary>A documented contract.</summary>',
    '/// <remarks>Compare <see cref="Contract.Run(string)"/> and <see cref="System.String"/>.</remarks>',
    'public class Contract {',
    '/// <summary>Returns &lt;unsafe&gt; &amp; &quot;quoted&quot; text.</summary>',
    '/// <remarks>Use <see cref="Contract"/> before dispatch.</remarks>',
    '/// <param name="value">The string argument.</param>',
    '/// <returns>The unchanged string.</returns>',
    'public string Run(string value) => value;',
    '/// <summary>Runs a number.</summary>',
    '/// <param name="value">The numeric argument.</param>',
    '/// <returns>The unchanged number.</returns>',
    'public int Run(int value) => value;',
    '/// <summary>Transforms an item.</summary>',
    '/// <typeparam name="T">The item type.</typeparam>',
    '/// <param name="value">The item.</param>',
    '/// <returns>The same item.</returns>',
    'public T Echo<T>(T value) where T : class => value;',
    '}',
    '/// <summary>An operation contract.</summary>',
    'public interface IOperation {',
    '/// <summary>Reads one value.</summary>',
    '/// <param name="cancellationToken">Cancels the read.</param>',
    '/// <returns>The value.</returns>',
    'string Read(System.Threading.CancellationToken cancellationToken = default);',
    '}',
    '/// <summary>An inherited implementation.</summary>',
    'public class Operation : IOperation {',
    '/// <inheritdoc/>',
    'public string Read(System.Threading.CancellationToken cancellationToken = default) => "value";',
    '/// <summary>A nullable initialization-only option.</summary>',
    'public string? Option { get; init; }',
    '/// <summary>Transforms argument ownership.</summary>',
    'public void Transform(ref int version, out string? message) { message = null; }',
    '}',
    '/// <summary>A record with generated equality methods.</summary>',
    '/// <param name="Name">The visible name.</param>',
    'public record Item(string Name);',
  ].join('\n');

  try {
    cpSync(resolve(root, 'global.json'), resolve(directory, 'global.json'));
    writeFileSync(
      resolve(directory, 'Fixture.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><GenerateDocumentationFile>true</GenerateDocumentationFile><Nullable>enable</Nullable><Version>0.1.0-preview.2</Version><InformationalVersion>0.1.0-preview.2+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</InformationalVersion></PropertyGroup></Project>',
    );
    writeFileSync(resolve(directory, 'Contract.cs'), source);
    execFileSync(
      'dotnet',
      [
        'restore',
        'Fixture.csproj',
        '--ignore-failed-sources',
        '-p:NuGetAudit=false',
        '--verbosity',
        'quiet',
      ],
      { cwd: directory, stdio: 'pipe' },
    );
    execFileSync(
      'dotnet',
      [
        'build',
        'Fixture.csproj',
        '--no-restore',
        '-p:UseSharedCompilation=false',
        '--verbosity',
        'quiet',
      ],
      { cwd: directory, stdio: 'pipe' },
    );
    const dll = resolve(directory, 'bin/Debug/net10.0/Fixture.dll');
    const docs = resolve(directory, 'bin/Debug/net10.0/Fixture.xml');
    const baseline = resolve(directory, 'abi.json');
    execFileSync('dotnet', [tool, dll, 'Hashbrown.AspNetCore', baseline], {
      stdio: 'pipe',
    });
    const output = resolve(directory, 'reference.json');
    requireSuccess(generate(dll, docs, baseline, output));
    const bytes = readFileSync(output, 'utf8');
    const reference = JSON.parse(bytes);
    const contract = reference.types.find(
      (type) => type.name === 'Hashbrown.AspNetCore.Contract',
    );
    const overloads = contract.members.filter(
      (member) => member.name === 'Run',
    );
    const stringOverload = overloads.find((member) =>
      member.id.endsWith('(System.String)'),
    );
    const echo = contract.members.find((member) => member.name === 'Echo');
    const record = reference.types.find(
      (type) => type.name === 'Hashbrown.AspNetCore.Item',
    );
    const operation = reference.types.find(
      (type) => type.name === 'Hashbrown.AspNetCore.Operation',
    );
    const inherited = operation.members.find(
      (member) => member.name === 'Read',
    );
    const option = operation.members.find((member) => member.name === 'Option');
    const transform = operation.members.find(
      (member) => member.name === 'Transform',
    );
    const copiedXml = resolve(directory, 'copy.xml');
    cpSync(docs, copiedXml);
    requireSuccess(
      generate(dll, copiedXml, baseline, resolve(directory, 'second.json')),
    );

    assert.equal(inherited.docs.summary, 'Reads one value.');
    assert.equal(inherited.docs.returns, 'The value.');
    assert.deepEqual(inherited.docs.params, [
      { name: 'cancellationToken', description: 'Cancels the read.' },
    ]);
    assert.match(
      inherited.declaration,
      /CancellationToken cancellationToken = default/,
    );
    assert.doesNotMatch(
      inherited.declaration,
      /CancellationToken cancellationToken = null/,
    );
    assert.equal(option.declaration, 'public string? Option { get; init; }');
    assert.equal(
      transform.declaration,
      'public void Transform(ref int version, out string? message);',
    );
    assert.equal(overloads.length, 2);
    assert.equal(new Set(overloads.map((member) => member.anchor)).size, 2);
    for (const member of overloads)
      assert.match(member.anchor, /^[a-zA-Z][a-zA-Z0-9_-]*$/);
    assert.equal(
      stringOverload.declaration,
      'public string Run(string value);',
    );
    assert.equal(
      stringOverload.docs.summary,
      'Returns <unsafe> & "quoted" text.',
    );
    assert.equal(stringOverload.docs.returns, 'The unchanged string.');
    assert.deepEqual(stringOverload.docs.params, [
      { name: 'value', description: 'The string argument.' },
    ]);
    assert.match(stringOverload.docs.remarks, /before dispatch/);
    assert.ok(
      stringOverload.docs.references.some(
        (ref) => ref.target === 'T:Hashbrown.AspNetCore.Contract',
      ),
    );
    assert.ok(
      contract.docs.references.some(
        (ref) =>
          ref.target === 'M:Hashbrown.AspNetCore.Contract.Run(System.String)',
      ),
    );
    assert.ok(
      contract.docs.references.some((ref) => ref.target === 'T:System.String'),
    );
    assert.equal(
      echo.id,
      'M:Hashbrown.AspNetCore.Contract.Echo' +
        String.fromCharCode(96, 96) +
        '1(' +
        String.fromCharCode(96, 96) +
        '0)',
    );
    assert.match(
      echo.declaration,
      /public T Echo<T>\(T value\) where T : class;/,
    );
    assert.deepEqual(echo.docs.typeParams, [
      { name: 'T', description: 'The item type.' },
    ]);
    assert.ok(
      record.members.every(
        (member) =>
          !/Equals|GetHashCode|ToString|Deconstruct|Clone/.test(member.name),
      ),
    );
    assert.equal(
      bytes,
      readFileSync(resolve(directory, 'second.json'), 'utf8'),
    );
    assert.doesNotMatch(bytes, /aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);

    writeFileSync(
      copiedXml,
      readFileSync(docs, 'utf8').replace(
        'name="T:Hashbrown.AspNetCore.Contract"',
        'name="T:Hashbrown.AspNetCore.Missing"',
      ),
    );
    const missingDocs = generate(
      dll,
      copiedXml,
      baseline,
      resolve(directory, 'invalid.json'),
    );
    const changedApi = JSON.parse(readFileSync(baseline, 'utf8'));
    changedApi.types.pop();
    writeFileSync(
      resolve(directory, 'changed-api.json'),
      JSON.stringify(changedApi),
    );
    const unreviewed = generate(
      dll,
      docs,
      resolve(directory, 'changed-api.json'),
      resolve(directory, 'unreviewed.json'),
    );

    assert.notEqual(missingDocs.status, 0);
    assert.match(missingDocs.stderr + missingDocs.stdout, /XML|document/i);
    assert.notEqual(unreviewed.status, 0);
    assert.match(unreviewed.stderr + unreviewed.stdout, /review|API|baseline/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
