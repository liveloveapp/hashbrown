import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLOUDFLARE_PAGES_PROJECTS,
  TARGETS,
  createVercelClient,
  deleteCloudflarePagesProjects,
  ensureCertificate,
  ensureDnsZone,
  ensureBuildSettings,
  ensureDomain,
  ensureDomainRemoved,
  ensureProject,
  ensurePublicDeployments,
  ensureResources,
  missingDnsRecords,
  missingEnv,
  upsertEnv,
} from './bootstrap.mjs';

function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname + new URL(url).search;
    calls.push({
      method,
      path,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    const handler = routes[`${method} ${path}`];
    if (!handler) {
      return new Response(
        JSON.stringify({ error: { code: 'not_found', message: path } }),
        { status: 404 },
      );
    }
    const { status = 200, body = {} } =
      typeof handler === 'function' ? handler() : handler;
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

test('createVercelClient sends a bearer token and throws on non-2xx', async () => {
  const seen = [];
  const vercel = createVercelClient('tok', async (url, init) => {
    seen.push(init.headers.authorization);
    return new Response(
      JSON.stringify({ error: { code: 'forbidden', message: 'nope' } }),
      { status: 403 },
    );
  });

  await assert.rejects(
    () => vercel('GET', '/v2/user'),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, 'forbidden');
      return true;
    },
  );
  assert.deepEqual(seen, ['Bearer tok']);
});

test('createVercelClient scopes every request to the team when given', async () => {
  const seen = [];
  const vercel = createVercelClient(
    'tok',
    async (url) => {
      seen.push(url);
      return new Response('{}', { status: 200 });
    },
    { teamId: 'team_1' },
  );

  await vercel('GET', '/v5/domains/hashbrown.dev');
  await vercel('GET', '/v5/domains/hashbrown.dev/records?limit=100');

  assert.deepEqual(seen, [
    'https://api.vercel.com/v5/domains/hashbrown.dev?teamId=team_1',
    'https://api.vercel.com/v5/domains/hashbrown.dev/records?limit=100&teamId=team_1',
  ]);
});

test('ensureProject returns the existing project without creating', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/hashbrown-www': {
      body: { id: 'prj_1', name: 'hashbrown-www' },
    },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const result = await ensureProject(vercel, 'hashbrown-www');

  assert.equal(result.status, 'exists');
  assert.equal(result.project.id, 'prj_1');
  assert.deepEqual(
    calls.map((call) => call.method),
    ['GET'],
  );
});

test('ensureResources sets fluid and the function timeout once', async () => {
  const { fetchImpl, calls } = stubFetch({
    'PATCH /v9/projects/prj_1': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);
  const resources = { fluid: true, functionDefaultTimeout: 300 };

  assert.equal(
    await ensureResources(
      vercel,
      {
        id: 'prj_1',
        resourceConfig: { fluid: false, buildMachineType: 'basic' },
      },
      resources,
    ),
    'updated',
  );
  // The existing config is carried through: a PATCH replaces resourceConfig.
  assert.deepEqual(calls[0].body, {
    resourceConfig: {
      fluid: true,
      buildMachineType: 'basic',
      functionDefaultTimeout: 300,
    },
  });

  // Vercel reports the effective timeout under defaultResourceConfig, so a
  // project already at the wanted ceiling is left alone.
  assert.equal(
    await ensureResources(
      vercel,
      {
        id: 'prj_1',
        resourceConfig: { fluid: true },
        defaultResourceConfig: { functionDefaultTimeout: 300 },
      },
      resources,
    ),
    'exists',
  );
  assert.equal(
    await ensureResources(vercel, { id: 'prj_1' }, undefined),
    'skipped',
  );
  assert.equal(calls.length, 1);
});

test('ensureBuildSettings patches only the build settings that differ', async () => {
  const { fetchImpl, calls } = stubFetch({
    'PATCH /v9/projects/prj_1': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);
  const build = {
    framework: 'nextjs',
    rootDirectory: 'www',
    buildCommand: 'npx nx build www',
    installCommand: 'true',
  };

  const updated = await ensureBuildSettings(
    vercel,
    { id: 'prj_1', framework: null, rootDirectory: 'www' },
    build,
  );
  const unchanged = await ensureBuildSettings(
    vercel,
    { id: 'prj_1', ...build },
    build,
  );
  const skipped = await ensureBuildSettings(vercel, { id: 'prj_1' }, undefined);

  assert.equal(updated, 'updated');
  assert.deepEqual(calls[0].body, {
    framework: 'nextjs',
    buildCommand: 'npx nx build www',
    installCommand: 'true',
  });
  assert.equal(unchanged, 'exists');
  assert.equal(skipped, 'skipped');
  assert.equal(calls.length, 1);
});

test('the www target builds the Next.js site from www', () => {
  const target = TARGETS.find((t) => t.key === 'www');

  assert.equal(target?.project, 'hashbrown-www');
  assert.equal(target?.secret, 'VERCEL_PROJECT_ID_WWW');
  assert.deepEqual(
    target?.domains.map((d) => d.name),
    ['hashbrown.dev', 'www.hashbrown.dev'],
  );
  assert.equal(target?.previousProject, 'hashbrown-www-analog');
  assert.deepEqual(target?.removedDomains, ['next.hashbrown.dev']);
  assert.deepEqual(target?.build, {
    framework: 'nextjs',
    rootDirectory: 'www',
    buildCommand: 'npx nx build www',
    installCommand: 'true',
  });
});

test('ensurePublicDeployments clears SSO protection once', async () => {
  const { fetchImpl, calls } = stubFetch({
    'PATCH /v9/projects/prj_1': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(
    await ensurePublicDeployments(vercel, {
      id: 'prj_1',
      ssoProtection: { deploymentType: 'all_except_custom_domains' },
    }),
    'updated',
  );
  assert.deepEqual(calls[0].body, {
    ssoProtection: null,
    passwordProtection: null,
  });
  assert.equal(
    await ensurePublicDeployments(vercel, { id: 'prj_1', ssoProtection: null }),
    'exists',
  );
  assert.equal(calls.length, 1);
});

test('ensureProject creates a framework-less project when missing', async () => {
  const { fetchImpl, calls } = stubFetch({
    'POST /v11/projects': { body: { id: 'prj_2', name: 'hashbrown-www' } },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const result = await ensureProject(vercel, 'hashbrown-www');

  assert.equal(result.status, 'created');
  assert.deepEqual(calls[1].body, { name: 'hashbrown-www', framework: null });
});

test('upsertEnv skips empty values and targets production and preview', async () => {
  const { fetchImpl, calls } = stubFetch({
    'POST /v10/projects/prj_1/env?upsert=true': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(
    await upsertEnv(vercel, 'prj_1', {
      OPENAI_API_KEY: '',
      OPENAI_MODEL: undefined,
    }),
    'skipped',
  );
  assert.equal(
    await upsertEnv(vercel, 'prj_1', { OPENAI_API_KEY: 'sk-test' }),
    'updated',
  );
  assert.deepEqual(calls.at(-1).body, [
    {
      key: 'OPENAI_API_KEY',
      value: 'sk-test',
      type: 'encrypted',
      target: ['production', 'preview'],
    },
  ]);
});

test('upsertEnv throws when the API reports failed variables', async () => {
  const { fetchImpl } = stubFetch({
    'POST /v10/projects/prj_1/env?upsert=true': {
      body: {
        created: [],
        failed: [
          {
            error: {
              code: 'invalid_value',
              key: 'OPENAI_API_KEY',
              value: 'sk-test',
            },
          },
        ],
      },
    },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  await assert.rejects(
    () => upsertEnv(vercel, 'prj_1', { OPENAI_API_KEY: 'sk-test' }),
    (error) => {
      assert.match(error.message, /OPENAI_API_KEY: invalid_value/);
      assert.doesNotMatch(error.message, /sk-test/);
      return true;
    },
  );
});

test('ensureDomain moves a domain from the previous project in one step', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/prj_old/domains/www.hashbrown.dev': {
      body: { name: 'www.hashbrown.dev' },
    },
    'POST /v1/projects/prj_old/domains/www.hashbrown.dev/move': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const result = await ensureDomain(
    vercel,
    'prj_new',
    {
      name: 'www.hashbrown.dev',
      redirect: 'hashbrown.dev',
      redirectStatusCode: 308,
    },
    'prj_old',
  );

  assert.equal(result, 'moved');
  assert.deepEqual(calls.at(-1), {
    method: 'POST',
    path: '/v1/projects/prj_old/domains/www.hashbrown.dev/move',
    body: {
      projectId: 'prj_new',
      redirect: 'hashbrown.dev',
      redirectStatusCode: 308,
    },
  });
});

test('ensureDomain waits out a www redirect that moved with its apex', async () => {
  // Moving the apex also moves its www redirect, asynchronously: for a moment
  // www is on neither project, so creating it fails with 409.
  let targetChecks = 0;
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/prj_new/domains/www.hashbrown.dev': () =>
      ++targetChecks < 3
        ? { status: 404, body: { error: { code: 'not_found' } } }
        : { body: { redirect: 'hashbrown.dev', redirectStatusCode: 308 } },
    'POST /v10/projects/prj_new/domains': {
      status: 409,
      body: { error: { code: 'domain_already_in_use' } },
    },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const result = await ensureDomain(
    vercel,
    'prj_new',
    {
      name: 'www.hashbrown.dev',
      redirect: 'hashbrown.dev',
      redirectStatusCode: 308,
    },
    'prj_old',
    { wait: async () => undefined },
  );

  assert.equal(result, 'moved');
  assert.equal(targetChecks, 3);
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0);
});

test('ensureDomain gives up when a 409 domain never arrives', async () => {
  const { fetchImpl } = stubFetch({
    'POST /v10/projects/prj_new/domains': {
      status: 409,
      body: { error: { code: 'domain_already_in_use' } },
    },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  await assert.rejects(
    ensureDomain(vercel, 'prj_new', { name: 'www.hashbrown.dev' }, 'prj_old', {
      wait: async () => undefined,
      attempts: 3,
    }),
    /409/,
  );
});

test('ensureDomain creates the domain when neither project has it', async () => {
  const { fetchImpl, calls } = stubFetch({
    'POST /v10/projects/prj_new/domains': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const result = await ensureDomain(
    vercel,
    'prj_new',
    { name: 'hashbrown.dev' },
    'prj_old',
  );

  assert.equal(result, 'created');
  assert.equal(calls.at(-1).path, '/v10/projects/prj_new/domains');
});

test('ensureDomainRemoved detaches a domain only when attached', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/prj_1/domains/next.hashbrown.dev': {
      body: { name: 'next.hashbrown.dev' },
    },
    'DELETE /v9/projects/prj_1/domains/next.hashbrown.dev': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const removed = await ensureDomainRemoved(
    vercel,
    'prj_1',
    'next.hashbrown.dev',
  );
  const absent = await ensureDomainRemoved(
    vercel,
    'prj_1',
    'gone.hashbrown.dev',
  );

  assert.equal(removed, 'removed');
  assert.equal(absent, 'absent');
  assert.equal(calls.filter((c) => c.method === 'DELETE').length, 1);
});

test('ensureDomain treats an existing project domain as exists', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/prj_1/domains/www.hashbrown.dev': {
      body: { name: 'www.hashbrown.dev' },
    },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(
    await ensureDomain(vercel, 'prj_1', { name: 'www.hashbrown.dev' }),
    'exists',
  );
  assert.equal(calls.length, 1);
});

test('ensureDnsZone enables the zone only when it is missing', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v5/domains/hashbrown.dev': { body: { domain: { zone: false } } },
    'PATCH /v3/domains/hashbrown.dev': { body: { zone: true } },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(await ensureDnsZone(vercel, 'hashbrown.dev'), 'updated');
  assert.deepEqual(calls[1].body, { op: 'update', zone: true });
});

test('ensureDnsZone reports an existing zone without patching', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v5/domains/hashbrown.dev': { body: { domain: { zone: true } } },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(await ensureDnsZone(vercel, 'hashbrown.dev'), 'exists');
  assert.equal(calls.length, 1);
});

test('ensureCertificate issues a certificate only when none exists', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v5/now/certs?domain=hashbrown.dev': { body: { certs: [] } },
    'POST /v7/certs': { body: { id: 'cert_1' } },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(
    await ensureCertificate(vercel, ['hashbrown.dev', 'www.hashbrown.dev']),
    'issued',
  );
  assert.deepEqual(calls[1].body, {
    cns: ['hashbrown.dev', 'www.hashbrown.dev'],
  });
});

test('ensureDomain creates a missing domain with its redirect', async () => {
  const { fetchImpl, calls } = stubFetch({
    'POST /v10/projects/prj_1/domains': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(
    await ensureDomain(vercel, 'prj_1', {
      name: 'www.hashbrown.dev',
      redirect: 'hashbrown.dev',
      redirectStatusCode: 308,
    }),
    'created',
  );
  assert.deepEqual(calls.at(-1).body, {
    name: 'www.hashbrown.dev',
    redirect: 'hashbrown.dev',
    redirectStatusCode: 308,
  });
});

test('ensureDomain patches an existing domain whose redirect differs', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/prj_1/domains/www.hashbrown.dev': {
      body: {
        name: 'www.hashbrown.dev',
        redirect: null,
        redirectStatusCode: null,
      },
    },
    'PATCH /v9/projects/prj_1/domains/www.hashbrown.dev': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(
    await ensureDomain(vercel, 'prj_1', {
      name: 'www.hashbrown.dev',
      redirect: 'hashbrown.dev',
      redirectStatusCode: 308,
    }),
    'updated',
  );
  assert.deepEqual(calls.at(-1).body, {
    redirect: 'hashbrown.dev',
    redirectStatusCode: 308,
  });
});

test('deleteCloudflarePagesProjects reports skipped for 404 and deleted for success', async () => {
  let index = 0;
  const fetchImpl = async () => {
    const first = index === 0;
    index += 1;
    return first
      ? new Response(JSON.stringify({ success: false }), { status: 404 })
      : new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  const results = await deleteCloudflarePagesProjects({
    token: 'cf',
    accountId: 'acct',
    fetchImpl,
  });

  assert.deepEqual(results, {
    [CLOUDFLARE_PAGES_PROJECTS[0]]: 'skipped',
    ...Object.fromEntries(
      CLOUDFLARE_PAGES_PROJECTS.slice(1).map((name) => [name, 'deleted']),
    ),
  });
});

test('deleteCloudflarePagesProjects throws when success is false', async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({ success: false, errors: [{ code: 10000 }] }),
      {
        status: 200,
      },
    );

  await assert.rejects(
    () =>
      deleteCloudflarePagesProjects({
        token: 'cf',
        accountId: 'acct',
        fetchImpl,
      }),
    /Cloudflare delete hashbrown-www -> 200: 10000/,
  );
});

test('missingEnv reports keys absent from production', async () => {
  const { fetchImpl } = stubFetch({
    'GET /v9/projects/prj_1/env': {
      body: {
        envs: [
          { key: 'OPENAI_API_KEY', target: ['production', 'preview'] },
          { key: 'DATABASE_URL', target: ['preview'] },
        ],
      },
    },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.deepEqual(
    await missingEnv(vercel, 'prj_1', ['OPENAI_API_KEY', 'DATABASE_URL']),
    ['DATABASE_URL'],
  );
});

test('TARGETS entries are well-formed and secrets follow the naming convention', () => {
  for (const target of TARGETS) {
    assert.equal(typeof target.key, 'string');
    assert.equal(typeof target.project, 'string');
    assert.equal(typeof target.secret, 'string');
    assert.ok(Array.isArray(target.domains) && target.domains.length > 0);
    assert.ok(Array.isArray(target.env) && target.env.length > 0);
    assert.ok(
      Array.isArray(target.requiredEnv) && target.requiredEnv.length > 0,
    );
    assert.equal(
      target.secret,
      `VERCEL_PROJECT_ID_${target.key.toUpperCase().replaceAll('-', '_')}`,
    );
  }
});

test('missingDnsRecords compares name, type and value', () => {
  const existing = [
    { name: '', type: 'MX', value: 'mail.example.com.' },
    { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none' },
  ];
  const wanted = [
    { name: '', type: 'MX', value: 'mail.example.com.', mxPriority: 10 },
    { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none' },
    { name: 'blog', type: 'CNAME', value: 'ghs.googlehosted.com.' },
  ];

  assert.deepEqual(missingDnsRecords(existing, wanted), [wanted[2]]);
});
