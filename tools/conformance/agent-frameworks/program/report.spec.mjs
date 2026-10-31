import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadInventory, validateInventory } from './inventory.mjs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { escape, code } from './report-markdown.mjs';

import { renderCompatibility, generateCompatibility } from './report.mjs';
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const body = (page) => page.slice(page.indexOf('\n# Framework compatibility'));

test('renders exact qualifications and native SDK seam transport limits without mutating input', async () => {
  const inventory = freeze(await loadInventory());
  const before = JSON.stringify(inventory);

  const page = renderCompatibility(inventory, 'react');

  assert.match(page, /Framework compatibility: Hashbrown React Docs/);
  for (const profile of inventory.profiles.filter((x) => x.qualification)) {
    assert.ok(page.includes(profile.id));
    for (const [dependency, version] of Object.entries(profile.versions)) {
      assert.ok(page.includes(dependency));
      assert.ok(page.includes(version));
    }
    assert.ok(page.includes(profile.qualification.transport));
    assert.ok(page.includes(profile.qualification.qualifiedAt));
    for (const claim of profile.qualification.claims) {
      assert.ok(page.includes(claim.scenarioId));
      assert.ok(page.includes(claim.status));
    }
  }
  assert.match(page, /no API server/);
  assert.match(page, /Runtime.*not-recorded/);
  assert.match(page, /Protocol.*not-recorded/);
  assert.equal(JSON.stringify(inventory), before);
});

test('both SDK pages have the same evidence body and SDK-specific titles', async () => {
  const inventory = await loadInventory();

  const react = renderCompatibility(inventory, 'react');
  const angular = renderCompatibility(inventory, 'angular');

  assert.match(angular, /Framework compatibility: Hashbrown Angular Docs/);
  assert.equal(body(react), body(angular));
  assert.throws(() => renderCompatibility(inventory, 'vue'));
});

test('retains planned coverage, all families, six producer gaps and the .NET audit boundary', async () => {
  const inventory = await loadInventory();

  const page = renderCompatibility(inventory, 'react');

  for (const family of inventory.catalog.families)
    assert.ok(page.includes(family.label));
  for (const planned of inventory.catalog.plannedProfiles) {
    assert.ok(page.includes(planned.id));
    assert.ok(page.includes(planned.detail));
  }
  const text = page.replace(/&#(\d+);/g, (_, number) =>
    String.fromCharCode(Number(number)),
  );
  for (const gap of inventory.producerGaps)
    assert.ok(text.includes(gap.detail));
  assert.match(page, /Pydantic AI/);
  assert.match(page, /Source audit only/);
  assert.match(page, /display qualification not tested/);
  assert.match(page, /recipe-required.*does not mean a recipe was tested/);
  assert.match(page, /file-search.*deferred/);
});

test('links historical evidence at immutable commits and separates current attempt health', async () => {
  const inventory = await loadInventory();
  const profile = inventory.profiles[0];

  const page = renderCompatibility(inventory, 'react');

  assert.ok(
    page.includes(
      `/blob/${profile.qualification.sourceCommit}/${profile.qualification.capture.path}`,
    ),
  );
  for (const source of profile.qualification.sources) {
    assert.ok(
      page.includes(
        `/blob/${profile.qualification.sourceCommit}/${source.path}`,
      ),
    );
    assert.ok(page.includes(source.sha256.slice(0, 12)));
  }
  assert.ok(page.includes(`/commit/${profile.qualification.sourceCommit}`));
  assert.match(page, /Last qualified/);
  assert.match(page, /Recorded run health/);
  assert.match(
    page,
    /Static as-of snapshot of the reviewed qualification record/,
  );
  assert.match(page, /not a real-time status/);
  assert.match(page, /not-run/);
  assert.ok(page.includes(inventory.runHealth.reason));
  assert.match(page, /#844/);
  assert.match(page, /Candidate execution.*not run/);
  assert.doesNotMatch(page, /fully supported|passed with recipe/);
});

for (const [name, change] of [
  [
    'unknown status',
    (x) => {
      x.profiles[0].capabilities.activities = 'green';
    },
  ],
  [
    'planned qualification',
    (x) => {
      x.profiles.at(-1).qualification = x.profiles[0].qualification;
    },
  ],
  [
    'passed contradiction',
    (x) => {
      x.profiles[0].qualification.claims[0].evidence = [];
    },
  ],
]) {
  test(`rejects ${name} before rendering`, async () => {
    const inventory = await loadInventory();
    change(inventory);

    const render = () => renderCompatibility(inventory, 'react');

    assert.throws(render);
  });
}

test('write mode is deterministic and check rejects missing or stale generated pages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hashbrown-report-'));
  const react = join(root, 'www/content/docs/react/platform/compatibility.md');

  try {
    await assert.rejects(
      generateCompatibility(root, { mode: 'check' }),
      /missing|stale/i,
    );
    await generateCompatibility(root, { mode: 'write' });
    const first = await readFile(react, 'utf8');
    await generateCompatibility(root, { mode: 'write' });
    const second = await readFile(react, 'utf8');
    await generateCompatibility(root, { mode: 'check' });
    await writeFile(react, `${first}\nstale`);

    assert.equal(first, second);
    await assert.rejects(
      generateCompatibility(root, { mode: 'check' }),
      /stale/i,
    );
    await assert.rejects(
      generateCompatibility(root, { mode: 'invalid' }),
      /mode/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects detached unvalidated inventories even when their structure looks valid', async () => {
  const inventory = structuredClone(await loadInventory());

  const render = () => renderCompatibility(inventory, 'react');

  assert.throws(render, /validated/i);
});

test('escapes Markdown and HTML in reviewed descriptions without corrupting table structure', async () => {
  const directory = new URL('./', import.meta.url);
  const repositoryRoot = new URL('../../../../', directory);
  const catalog = JSON.parse(
    await readFile(new URL('catalog.json', directory), 'utf8'),
  );
  const qualification = JSON.parse(
    await readFile(new URL('qualification.json', directory), 'utf8'),
  );
  const legacy = JSON.parse(
    await readFile(new URL('../capabilities.json', directory), 'utf8'),
  );
  const references = [
    ...qualification.producerSources,
    ...qualification.records.flatMap((record) => [
      record.capture,
      ...record.sources,
    ]),
  ];
  const evidence = Object.fromEntries(
    await Promise.all(
      references.map(async ({ path }) => {
        const content = await readFile(new URL(path, repositoryRoot), 'utf8');
        return [
          path,
          {
            content,
            sha256: createHash('sha256').update(content).digest('hex'),
          },
        ];
      }),
    ),
  );
  catalog.families[0].label =
    'Unsafe | [link](javascript:alert) <script> & `code`\nnext';
  const inventory = freeze(
    validateInventory({ catalog, qualification, legacy, evidence }),
  );

  const page = renderCompatibility(inventory, 'react');

  assert.ok(
    page.includes(
      'Unsafe &#124; &#91;link&#93;(javascript:alert) &#60;script&#62; &#38; &#96;code&#96; next',
    ),
  );
  assert.doesNotMatch(page, /<script>|\[link\]\(javascript:/);
});

test('lists each immutable source once per profile while tracing every claim stage', async () => {
  const inventory = await loadInventory();

  const page = renderCompatibility(inventory, 'react');

  for (const profile of inventory.profiles.filter(
    (item) => item.qualification,
  )) {
    const section = page.split(`### ${profile.id}\n`)[1].split('\n### ')[0];
    for (const source of profile.qualification.sources) {
      const url = `/blob/${profile.qualification.sourceCommit}/${source.path}`;
      assert.equal(
        section.split(url).length - 1,
        1,
        `${profile.id}: ${source.path}`,
      );
    }
    for (const claim of profile.qualification.claims) {
      assert.ok(section.includes(claim.scenarioId));
      for (const item of claim.evidence)
        assert.ok(section.includes(item.stage));
    }
  }
});

test('planned profiles reference the complete catalog without repeating every scenario list', async () => {
  const inventory = await loadInventory();

  const page = renderCompatibility(inventory, 'react');

  assert.match(
    page,
    /Scenario scope: all 26 scenarios in the shared catalog below/,
  );
});

test('escapes Markdown block prefixes in prose while preserving inline code versions', () => {
  const values = [
    '# Heading',
    '  ## Heading',
    '- item',
    '+ item',
    '1. item',
    '2026. item',
  ];

  const escaped = values.map(escape);

  assert.deepEqual(escaped, [
    '&#35; Heading',
    '  &#35;# Heading',
    '&#45; item',
    '&#43; item',
    '1&#46; item',
    '2026&#46; item',
  ]);
  assert.equal(code('1.2.3'), '<code>1.2.3</code>');
  assert.equal(code('- package'), '<code>- package</code>');
  assert.equal(escape('ordinary 1. item'), 'ordinary 1. item');
});

test('CLI returns nonzero for invalid arguments and missing or stale pages, and zero after writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hashbrown-report-cli-'));
  const executable = fileURLToPath(new URL('./report.mjs', import.meta.url));
  const run = (...args) =>
    spawnSync(process.execPath, [executable, ...args], { encoding: 'utf8' });

  try {
    const invalid = run('--invalid');
    const extra = run('--write', '--unexpected', root);
    const missing = run('--check', '--root', root);
    const write = run('--write', '--root', root);
    const check = run('--check', '--root', root);
    const page = join(
      root,
      'www/content/docs/angular/platform/compatibility.md',
    );
    await writeFile(page, 'stale');
    const stale = run('--check', '--root', root);

    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Usage:/);
    assert.notEqual(extra.status, 0);
    assert.match(extra.stderr, /Usage:/);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing generated page/);
    assert.equal(write.status, 0, write.stderr);
    assert.equal(check.status, 0, check.stderr);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /Stale generated page/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('describes the configured weekly baseline without claiming a fresh execution', async () => {
  const inventory = await loadInventory();

  const page = renderCompatibility(inventory, 'react');

  assert.match(page, /weekly baseline workflow/);
  assert.match(page, /configured to run on main after the workflow is enabled/);
  assert.match(page, /seven approved pinned Node profiles/);
  assert.match(page, /does not claim a new weekly run exists or passed/);
  assert.doesNotMatch(page, /planned weekly report location/);
});
