import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createRequire } from 'node:module';
import {
  validateReleaseProof,
  selectReleaseBundle,
  assertSuccessfulMainCI,
  downloadPublicPackage,
} from './nuget-release.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const revision = 'a'.repeat(40);
const golden = Array.from({ length: 664 }, (_, i) => [
  'react-openai',
  'suite.spec.ts',
  `case ${i}`,
]);
const regressions = ['react', 'angular'].flatMap((framework) =>
  ['browser-held', 'browser-held-slow', 'browser-held-hung'].map((mode) => [
    framework,
    'native-approval.spec.ts',
    `genuine native approval browser ${mode} ${mode === 'browser-held-hung' ? 'aborts at the authoritative deadline without a successful terminal' : 'accepts successful terminal before HTTP EOF and rejects damaged captures'}`,
  ]),
);
const options = {
  revision,
  sources: { 'packages/dotnet/Test.cs': hash('source') },
  golden,
};
async function json(root, name, value) {
  await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await fs.writeFile(path.join(root, name), JSON.stringify(value));
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nuget-release-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const archive = 'Hashbrown.AspNetCore.0.1.0-preview.1.nupkg';
  const symbols = archive.replace('.nupkg', '.snupkg');
  await fs.writeFile(path.join(root, archive), 'package');
  await fs.writeFile(path.join(root, symbols), 'symbols');
  await json(root, 'candidate.json', {
    metadata: '/private/metadata.json',
    sha256: hash('metadata'),
  });
  const descriptor = hash(await fs.readFile(path.join(root, 'candidate.json')));
  const provenance = {
    revision,
    identity: {
      id: 'Hashbrown.AspNetCore',
      version: '0.1.0-preview.1',
      sdk: '10.0.402',
    },
    archive: 'candidate-feed/' + archive,
    sha256: hash('package'),
    sources: options.sources,
    files: {
      ['candidate-feed/' + archive]: hash('package'),
      ['candidate-feed/' + symbols]: hash('symbols'),
    },
  };
  await json(root, 'candidate-provenance.json', provenance);
  const report = {
    schema: 1,
    profile: 'full',
    status: 'passed',
    packInvocations: 1,
    npmPreparations: 1,
    exportErrors: [],
    phases: [
      'candidate',
      'npm',
      'initial-qualification',
      'docs',
      'upgrade',
      'matrix',
      'regressions',
      'final-qualification',
      'final-npm-qualification',
    ].map((name) => ({ name, status: 0 })),
    candidate: {
      archive: provenance.archive,
      sha256: provenance.sha256,
      descriptorSha256: descriptor,
    },
    npm: { metadataPath: '/private/npm.json' },
    documentationPrograms: 32,
    archives: { [archive]: hash('package'), [symbols]: hash('symbols') },
    outcomes: {},
  };
  for (const [kind, identities] of [
    ['matrix', golden],
    ['regressions', regressions],
  ]) {
    const result = {
      status: 'passed',
      descriptor,
      npmMetadata: report.npm.metadataPath,
      expected: identities,
      outcomes: identities.map((identity) => ({
        identity,
        status: 'passed',
        expectedStatus: 'passed',
        retry: 0,
        errors: [],
      })),
      diagnostics: [],
    };
    await json(root, `browser/${kind}-outcomes.json`, result);
    report.outcomes[kind] = {
      count: identities.length,
      sha256: hash(
        await fs.readFile(path.join(root, `browser/${kind}-outcomes.json`)),
      ),
    };
  }
  await json(
    root,
    'docs-one/declared-programs.json',
    Array.from({ length: 32 }, (_, i) => ({ sourceSha256: hash('doc' + i) })),
  );
  for (let i = 0; i < 32; i++)
    await json(root, `docs-one/qualified-${i}.json`, {
      candidateSha256: provenance.sha256,
      sourceSha256: hash('doc' + i),
    });
  await json(root, 'upgrade/qualification.json', { status: 0 });
  await json(root, 'acceptance.json', report);
  return { root, archive, symbols, report, provenance };
}
async function mutate(root, name, change) {
  const value = JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
  change(value);
  await json(root, name, value);
}

test('qualifies the exact full proof and returns immutable relative archive facts', async (t) => {
  const f = await fixture(t);

  const result = await validateReleaseProof(f.root, options);

  assert.equal(result.archive, f.archive);
  assert.equal(result.symbols, f.symbols);
  assert.equal(result.archiveSha256, hash('package'));
  assert.equal(result.symbolsSha256, hash('symbols'));
});

for (const [name, file, change] of [
  [
    'wrong source revision',
    'candidate-provenance.json',
    (v) => {
      v.revision = 'b'.repeat(40);
    },
  ],
  [
    'partial smoke profile',
    'acceptance.json',
    (v) => {
      v.profile = 'pr';
    },
  ],
  [
    'missing phase',
    'acceptance.json',
    (v) => {
      v.phases.pop();
    },
  ],
  [
    'failed phase',
    'acceptance.json',
    (v) => {
      v.phases[4].status = 1;
    },
  ],
  [
    'export errors',
    'acceptance.json',
    (v) => {
      v.exportErrors.push({ code: 'MISSING' });
    },
  ],
  [
    'substituted source manifest',
    'candidate-provenance.json',
    (v) => {
      v.sources['packages/dotnet/Test.cs'] = hash('tamper');
    },
  ],
  [
    'substituted descriptor',
    'acceptance.json',
    (v) => {
      v.candidate.descriptorSha256 = hash('changed');
    },
  ],
  [
    'failed upgrade',
    'upgrade/qualification.json',
    (v) => {
      v.status = 1;
    },
  ],
  [
    'unbound documentation program',
    'docs-one/qualified-9.json',
    (v) => {
      v.candidateSha256 = hash('changed');
    },
  ],
])
  test(`rejects ${name}`, async (t) => {
    const f = await fixture(t);
    await mutate(f.root, file, change);

    await assert.rejects(validateReleaseProof(f.root, options));
  });

test('rejects same-count different golden identities even after replacing report hashes', async (t) => {
  const f = await fixture(t);
  await mutate(f.root, 'browser/matrix-outcomes.json', (v) => {
    v.expected[0] = ['fake', 'fake', 'fake'];
    v.outcomes[0].identity = v.expected[0];
  });
  await mutate(f.root, 'acceptance.json', (v) => {
    v.outcomes.matrix.sha256 = hash('placeholder');
  });
  const digest = hash(
    await fs.readFile(path.join(f.root, 'browser/matrix-outcomes.json')),
  );
  await mutate(f.root, 'acceptance.json', (v) => {
    v.outcomes.matrix.sha256 = digest;
  });

  await assert.rejects(validateReleaseProof(f.root, options));
});

test('rejects outcome errors even with substituted integrity hash', async (t) => {
  const f = await fixture(t);
  await mutate(f.root, 'browser/matrix-outcomes.json', (v) => {
    v.outcomes[0].errors = ['failure'];
  });
  const digest = hash(
    await fs.readFile(path.join(f.root, 'browser/matrix-outcomes.json')),
  );
  await mutate(f.root, 'acceptance.json', (v) => {
    v.outcomes.matrix.sha256 = digest;
  });

  await assert.rejects(validateReleaseProof(f.root, options));
});

test('rejects changed archive bytes and job-output hash substitution', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    validateReleaseProof(f.root, {
      ...options,
      expectedArchiveSha256: hash('different'),
    }),
  );
  await assert.rejects(
    validateReleaseProof(f.root, {
      ...options,
      expectedSymbolsSha256: hash('different'),
    }),
  );
  await fs.writeFile(path.join(f.root, f.archive), 'changed');
  await assert.rejects(validateReleaseProof(f.root, options));
});

test('rejects symlink evidence and ambiguous acceptance bundles', async (t) => {
  const f = await fixture(t);
  const root = path.join(f.root, 'ambiguous');
  await json(root, 'one/acceptance.json', {});
  await json(root, 'two/acceptance.json', {});
  const link = f.root + '-link';
  await fs.symlink(f.root, link);
  t.after(() => fs.rm(link, { force: true }));

  await assert.rejects(selectReleaseBundle(link));
  await assert.rejects(selectReleaseBundle(root), /Exactly one/);
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(path.join(f.root, f.archive));
  await fs.symlink('/etc/hosts', path.join(f.root, f.archive));
  await assert.rejects(validateReleaseProof(f.root, options));
});

test('requires the exact completed successful main workflow path, event and revision', () => {
  const run = {
    path: '.github/workflows/pr-main.yml',
    head_sha: revision,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
  };

  assert.doesNotThrow(() => assertSuccessfulMainCI([run], revision));
  for (const change of [
    { path: 'other.yml' },
    { head_sha: 'b'.repeat(40) },
    { head_branch: 'feature' },
    { event: 'pull_request' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
  ])
    assert.throws(() =>
      assertSuccessfulMainCI([{ ...run, ...change }], revision),
    );
});

test('polls bounded public availability and records actual organization ownership and raw bytes', async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const fetchImpl = async (url, init) => {
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    calls++;
    if (calls === 1) return new Response('', { status: 404 });
    return url.includes('flatcontainer')
      ? new Response('public package')
      : new Response(
          '<ul class="list-unstyled owner-list"><li><a class="username" href="/profiles/liveloveapp" title="liveloveapp">liveloveapp</a></li></ul>',
        );
  };

  const result = await downloadPublicPackage({
    directory: path.join(f.root, 'public'),
    fetchImpl,
    sleep: async () => undefined,
    attempts: 2,
  });

  assert.equal(result.rawSha256, hash('public package'));
  assert.deepEqual(result.owners, ['liveloveapp']);
  assert.equal(await fs.readFile(result.archive, 'utf8'), 'public package');
});

test('fails closed on absent organization owner or exhausted public polling', async (t) => {
  const f = await fixture(t);

  await assert.rejects(
    downloadPublicPackage({
      directory: path.join(f.root, 'unowned'),
      fetchImpl: async (url) =>
        new Response(
          url.includes('flatcontainer')
            ? 'bytes'
            : '<a href="/profiles/blove">blove</a>',
        ),
      sleep: async () => undefined,
      attempts: 1,
    }),
  );
  await assert.rejects(
    downloadPublicPackage({
      directory: path.join(f.root, 'missing'),
      fetchImpl: async () => new Response('', { status: 404 }),
      sleep: async () => undefined,
      attempts: 2,
    }),
  );
});

test('workflow confines identity write to publication after full immutable qualification', async () => {
  const require = createRequire(import.meta.url);
  const workflow = require('js-yaml').load(
    await fs.readFile(
      new URL('../.github/workflows/nuget-publish.yml', import.meta.url),
      'utf8',
    ),
  );
  const { qualify, publish } = workflow.jobs;
  const verify = workflow.jobs['verify-public'];

  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(qualify['timeout-minutes'], 120);
  assert.equal(verify['timeout-minutes'], 120);
  assert.match(qualify.if, /github.ref == 'refs\/heads\/main'/);
  assert.equal(publish.needs, 'qualify');
  assert.deepEqual(verify.needs, ['qualify', 'publish']);
  assert.equal(publish.environment, 'nuget');
  assert.equal(publish.permissions['id-token'], 'write');
  assert.equal(workflow.permissions['id-token'], undefined);
  for (const [name, job] of Object.entries(workflow.jobs)) {
    if (name !== 'publish')
      assert.equal(job.permissions?.['id-token'], undefined);
    const checkout = job.steps.find((step) =>
      step.uses?.startsWith('actions/checkout@'),
    );
    assert.equal(checkout.with.ref, '${{ github.sha }}');
    assert.equal(checkout.with['persist-credentials'], false);
    if (name === 'qualify' || name === 'verify-public')
      assert.equal(
        checkout.with['fetch-depth'],
        0,
        'Historical upgrade requires full Git history',
      );
  }
  const full = qualify.steps.find(
    (step) => step.run === 'npx nx package-acceptance dotnet-conformance',
  );
  assert.ok(full);
  const proofIndex = publish.steps.findIndex((step) => step.id === 'proof');
  const loginIndex = publish.steps.findIndex((step) => step.id === 'login');
  assert.ok(proofIndex >= 0 && loginIndex > proofIndex);
  assert.equal(
    publish.steps[proofIndex].env.EXPECTED_ARCHIVE_SHA256,
    '${{ needs.qualify.outputs.archiveSha256 }}',
  );
  assert.equal(
    publish.steps[proofIndex].env.EXPECTED_SYMBOLS_SHA256,
    '${{ needs.qualify.outputs.symbolsSha256 }}',
  );
  assert.match(publish.steps[loginIndex].uses, /^NuGet\/login@[a-f0-9]{40}$/);
  for (const job of [qualify, verify]) {
    const cleanup = job.steps.find(
      (step) => step.name === 'Stop owned PostgreSQL',
    );
    assert.equal(cleanup.if, 'always()');
    assert.match(cleanup.run, /docker rm --force "\$PG_CONTAINER"/);
  }
});
