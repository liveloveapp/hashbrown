import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import ApiIndexPage from '../src/app/api/page';
import { generateStaticParams } from '../src/app/api/[pkg]/[symbol]/page';
import { GET } from '../src/app/%5F/search-index/route';
import { DotnetSymbol } from '../src/components/api/DotnetSymbol';
import { apiMenuSections } from '../src/components/menus/api-menu.data';
import {
  dotnetReferenceHref,
  listDotnetSymbols,
  readDotnetReference,
  readDotnetSymbol,
} from '../src/lib/dotnet-reference';
import { repoRoot } from '../src/lib/repo-root';
import { listApiReferenceEntries } from '../src/lib/search-index';

const input = join(repoRoot(), 'packages/dotnet/api/reference-docs.json');

test('committed C# input supplies a static route for every reviewed type without the SDK', () => {
  const reference = readDotnetReference();
  const routes = generateStaticParams().filter(({ pkg }) => pkg === 'dotnet');

  expect(reference.types).toHaveLength(73);
  expect(reference.package).toEqual({
    id: 'Hashbrown.AspNetCore',
    version: '0.1.0-preview.2',
    status: 'unreleased',
  });
  expect(routes.map(({ symbol }) => symbol).sort()).toEqual(
    reference.types.map(({ slug }) => slug).sort(),
  );
  expect(listDotnetSymbols()).toEqual(reference.types);
  for (const type of reference.types)
    expect(readDotnetSymbol(type.slug)).toEqual(type);
  expect(readDotnetSymbol('../package')).toBeUndefined();
  expect(readDotnetSymbol('missing')).toBeUndefined();
});

test('reference loading fails clearly for missing, incompatible, stale and unsafe generated input', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hashbrown-web-reference-'));
  const path = join(directory, 'reference.json');
  const valid = JSON.parse(readFileSync(input, 'utf8'));

  try {
    expect(() => readDotnetReference(path)).toThrow(
      /missing|generate|reference/i,
    );
    for (const mutate of [
      (reference: typeof valid) => {
        reference.schemaVersion = 999;
      },
      (reference: typeof valid) => {
        reference.package.version = '0.1.0-preview.1';
      },
      (reference: typeof valid) => {
        reference.types[0].slug = '../escape';
      },
      (reference: typeof valid) => {
        reference.types.push(reference.types[0]);
      },
      (reference: typeof valid) => {
        reference.types[0].docs.summary = {};
      },
      (reference: typeof valid) => {
        const type = reference.types.find(
          (item: { members: unknown[] }) => item.members.length > 1,
        );
        type.members[1].anchor = type.members[0].anchor;
      },
    ]) {
      const changed = structuredClone(valid);
      mutate(changed);
      writeFileSync(path, JSON.stringify(changed));

      expect(() => readDotnetReference(path)).toThrow(
        /reference|schema|version|duplicate|invalid/i,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('member XML identities resolve to distinct real anchors while external references stay unlinked', () => {
  const reference = readDotnetReference();
  const members = reference.types.flatMap((type) =>
    type.members.map((member) => ({ type, member })),
  );

  for (const type of reference.types) {
    expect(dotnetReferenceHref(type.id)).toBe('/api/dotnet/' + type.slug);
    expect(new Set(type.members.map(({ anchor }) => anchor)).size).toBe(
      type.members.length,
    );
  }
  for (const { type, member } of members) {
    expect(dotnetReferenceHref(member.id)).toBe(
      '/api/dotnet/' + type.slug + '#' + member.anchor,
    );
  }
  expect(dotnetReferenceHref('T:System.String')).toBeUndefined();
  expect(dotnetReferenceHref('javascript:alert(1)')).toBeUndefined();
  expect(dotnetReferenceHref('T:Hashbrown.AspNetCore.Missing')).toBeUndefined();
});

test('C# pages render authored prose and member anchors with C# highlighting and escaped text', async () => {
  const original = readDotnetReference().types.find(
    (type) => type.members.length > 1,
  );
  if (!original) throw new Error('Expected a documented C# type with members');
  const symbol = structuredClone(original);
  symbol.docs.summary = '<script>alert("unsafe")</script> & a < b';
  symbol.members[0].docs.remarks = '<img src=x onerror=alert(1)>';

  const html = renderToStaticMarkup(await DotnetSymbol({ symbol }));

  expect(html).toContain('0.1.0-preview.2');
  expect(html).toMatch(/unreleased/i);
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img src=x');
  expect(html).toContain('shiki');
  expect(html).toMatch(/language-(?:csharp|cs)|data-language="(?:csharp|cs)"/);
  for (const member of symbol.members)
    expect(html).toContain('id="' + member.anchor + '"');
  expect(html).not.toContain('HideBySig');
});

test('API landing page and menu expose every C# type using its actual route', async () => {
  const types = listDotnetSymbols();

  const html = renderToStaticMarkup(await ApiIndexPage());
  const sections = apiMenuSections();
  const links = sections.flatMap((section) => section.children);

  expect(html).toContain('Hashbrown.AspNetCore');
  for (const type of types) {
    const url = '/api/dotnet/' + type.slug;
    expect(html).toContain('href="' + url + '"');
    expect(links).toContainEqual(
      expect.objectContaining({ kind: 'link', url }),
    );
  }
});

test('search exposes C# types and member links through the actual static search endpoint', async () => {
  const reference = readDotnetReference();

  const entries = listApiReferenceEntries();
  const payload = await GET().json();

  for (const type of reference.types) {
    const typeUrl = '/api/dotnet/' + type.slug;
    expect(entries).toContainEqual(
      expect.objectContaining({
        url: typeUrl,
        package: 'Hashbrown.AspNetCore',
      }),
    );
    expect(payload.apiReferences).toContain(typeUrl);
    for (const member of type.members) {
      const url = typeUrl + '#' + member.anchor;
      expect(entries).toContainEqual(
        expect.objectContaining({ url, package: 'Hashbrown.AspNetCore' }),
      );
      expect(payload.apiReferences).toContain(url);
    }
  }
});

test('llms artifacts include actual C# type and member URLs plus authored declarations', () => {
  const reference = readDotnetReference();

  const brief = readFileSync(join(repoRoot(), 'www/public/llms.txt'), 'utf8');
  const full = readFileSync(
    join(repoRoot(), 'www/public/llms-full.txt'),
    'utf8',
  );

  for (const type of reference.types) {
    const url = 'https://hashbrown.dev/api/dotnet/' + type.slug;
    expect(brief).toContain(url);
    expect(full).toContain(url);
    expect(full).toContain(type.declaration);
    expect(full).toContain(type.docs.summary);
    for (const member of type.members) {
      expect(full).toContain(url + '#' + member.anchor);
      expect(full).toContain(member.declaration);
    }
  }
  expect(full).toContain('0.1.0-preview.2');
  expect(full).toMatch(/unreleased/i);
});

test('website builds track committed C# input without acquiring an SDK build dependency', () => {
  const project = JSON.parse(
    readFileSync(join(repoRoot(), 'www/project.json'), 'utf8'),
  );
  const loader = readFileSync(
    join(repoRoot(), 'www/src/lib/dotnet-reference.ts'),
    'utf8',
  );
  const reader = readFileSync(
    join(repoRoot(), 'www/src/lib/dotnet-reference-input.mjs'),
    'utf8',
  );

  for (const target of ['build', 'test', 'collect-docs', 'generate-llms']) {
    expect(project.targets[target].inputs).toContain(
      '{workspaceRoot}/packages/dotnet/api/reference-docs.json',
    );
    expect(
      JSON.stringify(project.targets[target].dependsOn ?? []),
    ).not.toContain('dotnet-sdk');
  }
  expect(project.implicitDependencies ?? []).not.toContain('dotnet-sdk');
  expect(loader).not.toMatch(/import[^;]*packages\/dotnet/);
  expect(loader + reader).not.toMatch(/child_process|spawnSync|execFileSync/);
});
