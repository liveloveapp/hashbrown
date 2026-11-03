import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { selectCiSetup } from './ci-selection';

const readWorkflow = (name: string) =>
  parse(readFileSync(`.github/workflows/${name}.yml`, 'utf8'));

test('validation runs on ordinary PR updates and main without label events', () => {
  const workflow = readWorkflow('pr-main');

  const events = workflow.on;

  expect(events).toEqual({
    workflow_dispatch: null,
    pull_request: {
      branches: ['main'],
      types: ['opened', 'synchronize', 'reopened'],
    },
    push: { branches: ['main'] },
  });
});

test('label previews schedule only trusted preview labels in independent concurrency', () => {
  const validation = readWorkflow('pr-main');
  const workflow = readWorkflow('preview-label');

  const jobs = workflow.jobs;

  expect(workflow.on).toEqual({
    pull_request: { branches: ['main'], types: ['labeled'] },
  });
  expect(workflow.permissions).toEqual({ contents: 'read' });
  expect(workflow.concurrency.group).toBe(
    'preview-label-${{ github.event.pull_request.number }}-${{ github.event.label.name }}',
  );
  expect(workflow.concurrency.group).not.toBe(validation.concurrency.group);
  expect(workflow.concurrency['cancel-in-progress']).toBe(true);
  expect(Object.keys(jobs)).toEqual(['targets', 'preview']);
  expect(jobs.targets.if).toBe(
    "github.event.label.name == 'preview' && github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.user.login != 'dependabot[bot]'",
  );
  expect(jobs.preview.needs).toEqual(['targets']);
  expect(jobs.preview.uses).toBe('./.github/workflows/deploy.yml');
  expect(jobs.preview.with).toEqual({
    environment: 'preview',
    targets: '${{ needs.targets.outputs.matrix }}',
    ref: '${{ github.event.pull_request.head.sha }}',
    branch: '${{ github.event.pull_request.head.ref }}',
  });
  expect(jobs.preview.permissions).toEqual({
    contents: 'read',
    deployments: 'write',
  });
  expect(jobs.preview.secrets).toBe('inherit');
  expect(JSON.stringify(workflow)).not.toMatch(/PR Gate|NX_CLOUD_ACCESS_TOKEN/);
});

test('both callers share target selection with explicit PR and main inputs', () => {
  const validation = readWorkflow('pr-main');
  const labels = readWorkflow('preview-label');
  const selection = readWorkflow('select-deployment-targets');

  const targetJobs = [validation.jobs.targets, labels.jobs.targets];

  for (const job of targetJobs) {
    expect(job.uses).toBe('./.github/workflows/select-deployment-targets.yml');
    expect(job.with).toEqual({
      event: '${{ github.event_name }}',
      base: '${{ github.event.pull_request.base.sha }}',
      head: '${{ github.event.pull_request.head.sha }}',
    });
    expect(job.secrets).toBeUndefined();
  }
  expect(Object.keys(selection.on)).toEqual(['workflow_call']);
  expect(selection.on.workflow_call.outputs.matrix.value).toBe(
    '${{ jobs.targets.outputs.matrix }}',
  );
  expect(selection.permissions).toEqual({ contents: 'read' });
  expect(selection.jobs.targets.outputs.matrix).toBe(
    '${{ steps.select.outputs.matrix }}',
  );
  expect(selection.jobs.targets.steps[0].with).toMatchObject({
    'fetch-depth': 0,
    'persist-credentials': false,
  });
  const select = selection.jobs.targets.steps.find(
    (step: { id?: string }) => step.id === 'select',
  );
  expect(select.env).toMatchObject({
    EVENT: '${{ inputs.event }}',
    BASE: '${{ inputs.base }}',
    HEAD: '${{ inputs.head }}',
    NX_DAEMON: 'false',
  });
  expect(select.run).toContain('if [[ "$EVENT" != "pull_request" ]]');
  expect(select.run).toContain('"$BASE...$HEAD"');
  expect(select.run).toContain(
    '\\.github/workflows/(pr-main|deploy|preview-label|select-deployment-targets)\\.yml',
  );
  expect(select.run).toContain('--affected --base="$BASE" --head="$HEAD"');
  expect(JSON.parse(selection.env.DEPLOY_TARGETS)).toEqual([
    {
      key: 'www',
      dir: '.',
      project_id_secret: 'VERCEL_PROJECT_ID_WWW',
      builder: 'vercel',
      root: 'www',
    },
    {
      key: 'atc',
      dir: 'examples/atc',
      project_id_secret: 'VERCEL_PROJECT_ID_ATC',
    },
    {
      key: 'lifecycle',
      dir: 'tools/lifecycle',
      project_id_secret: 'VERCEL_PROJECT_ID_LIFECYCLE',
      optional: true,
    },
    {
      key: 'marketing',
      dir: 'tools/marketing',
      project_id_secret: 'VERCEL_PROJECT_ID_MARKETING',
      optional: true,
    },
    {
      key: 'workbench',
      dir: 'tools/workbench',
      project_id_secret: 'VERCEL_PROJECT_ID_WORKBENCH',
      optional: true,
    },
  ]);
  expect(validation.env).toBeUndefined();
  expect(JSON.stringify(selection)).not.toMatch(
    /NX_CLOUD_ACCESS_TOKEN|PR Gate/,
  );
});

test('ordinary previews and production still await validation and PR Gate requires success', () => {
  const workflow = readWorkflow('pr-main');

  const jobs = workflow.jobs;

  expect(jobs.preview.needs).toEqual(['ci', 'targets']);
  expect(jobs.production.needs).toEqual(['ci', 'targets']);
  expect(jobs.targets.if).toContain(
    "contains(github.event.pull_request.labels.*.name, 'preview')",
  );
  expect(jobs.targets.if).toContain(
    'github.event.pull_request.head.repo.full_name == github.repository',
  );
  expect(jobs.targets.if).toContain(
    "github.event.pull_request.user.login != 'dependabot[bot]'",
  );
  expect(jobs.targets.if).toContain("github.ref == 'refs/heads/main'");
  expect(jobs['pr-gate'].name).toBe('PR Gate');
  expect(jobs['pr-gate'].needs).toEqual([
    'ci',
    'targets',
    'preview',
    'candidate-cold-recovery',
    'dotnet-source-browser',
  ]);
  expect(jobs['pr-gate'].steps[0].env.CI_RESULT).toBe('${{ needs.ci.result }}');
  expect(jobs['pr-gate'].steps[0].run).toMatch(
    /if \[\[ "\$CI_RESULT" != "success" \]\]; then[\s\S]*?exit 1/,
  );
  expect(jobs.ci.env.NX_CLOUD_ACCESS_TOKEN).toBe(
    "${{ github.ref == 'refs/heads/main' && github.ref_protected && github.event_name != 'pull_request' && secrets.NX_CLOUD_ACCESS_TOKEN || '' }}",
  );
  expect(jobs.ci.steps).toContainEqual({
    name: 'Run required .NET package acceptance',
    if: "steps.setup.outputs.dotnet == 'true'",
    run: 'npx nx package-pr-acceptance dotnet-conformance',
  });
});

test('candidate cold recovery uses existing affected selection in an independent pinned bounded job', () => {
  const { jobs } = readWorkflow('pr-main');
  const job = jobs['candidate-cold-recovery'];

  expect(jobs.ci['timeout-minutes']).toBe(90);
  expect(jobs.ci.outputs.dotnet).toBe('${{ steps.setup.outputs.dotnet }}');
  expect(job).toBeDefined();
  expect(job.needs).toEqual(['ci']);
  expect(job.if).toBe(
    "${{ !cancelled() && needs.ci.result == 'success' && needs.ci.outputs.dotnet == 'true' }}",
  );
  expect(job['runs-on']).toBe('ubuntu-latest');
  expect(job['timeout-minutes']).toBe(300);
  expect(job.env.DOTNET_TEST_POSTGRES).toBe(jobs.ci.env.DOTNET_TEST_POSTGRES);
  const steps = job.steps as {
    uses?: string;
    with?: Record<string, unknown>;
    run?: string;
    if?: string;
  }[];
  expect(
    steps.find((step) => step.uses === 'actions/checkout@v7')?.with?.[
      'persist-credentials'
    ],
  ).toBe(false);
  expect(
    steps.find((step) => step.uses === 'actions/setup-node@v7')?.with?.[
      'node-version-file'
    ],
  ).toBe('.nvmrc');
  expect(
    steps.find((step) => step.uses === 'actions/setup-dotnet@v6')?.with?.[
      'dotnet-version'
    ],
  ).toBe('10.0.402');
  expect(steps.some((step) => step.run === 'npm ci')).toBe(true);
  const scripts = steps.map((step) => step.run ?? '').join('\n');
  expect(scripts).toContain('postgres:18');
  expect(scripts).toContain('hashbrown-postgres-cold');
  expect(scripts).toContain('npx playwright install chromium');
  expect(scripts).toContain('candidate-consumer/ci.mjs');
  expect(scripts).toContain('--evidence=');
  expect(scripts).not.toMatch(
    /--pilot|--smoke|--regressions|live-provider|credentials|nx affected/,
  );
  const upload = steps.find(
    (step) => step.uses === 'actions/upload-artifact@v7',
  );
  expect(upload?.if).toBe('always()');
  expect(upload?.with).toEqual({
    name: 'dotnet-candidate-cold-recovery',
    path: 'test-results/dotnet-candidate-recovery',
    'retention-days': 7,
    'if-no-files-found': 'error',
  });
  expect(
    steps.some(
      (step) =>
        step.if === 'always()' &&
        String(step.run).includes('docker rm --force hashbrown-postgres-cold'),
    ),
  ).toBe(true);
  expect(JSON.stringify(job)).not.toMatch(
    /secrets\.|secrets:|deployments|live-provider-e2e/,
  );
});

test('PR aggregate requires actual candidate success exactly when the existing dotnet selection requires it', () => {
  const { jobs } = readWorkflow('pr-main');
  const step = jobs['pr-gate'].steps[0];
  const execute = (required: string, result: string) => {
    try {
      execFileSync('bash', ['-c', step.run], {
        env: {
          PATH: process.env['PATH'],
          CI_RESULT: 'success',
          TARGETS_RESULT: 'skipped',
          PREVIEW_RESULT: 'skipped',
          CANDIDATE_REQUIRED: required,
          CANDIDATE_RESULT: result,
          SOURCE_BROWSER_RESULT: 'success',
        },
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  };

  expect(step.env.CANDIDATE_REQUIRED).toBe('${{ needs.ci.outputs.dotnet }}');
  expect(step.env.CANDIDATE_RESULT).toBe(
    '${{ needs.candidate-cold-recovery.result }}',
  );
  expect(execute('true', 'success')).toBe(true);
  expect(execute('false', 'skipped')).toBe(true);
  expect(execute('false', 'success')).toBe(true);
  for (const [required, result] of [
    ['true', 'skipped'],
    ['true', 'failure'],
    ['true', 'cancelled'],
    ['false', 'failure'],
    ['false', 'cancelled'],
    ['', 'success'],
    ['unexpected', 'success'],
  ]) {
    expect({ required, result, passed: execute(required, result) }).toEqual({
      required,
      result,
      passed: false,
    });
  }
  expect(jobs.preview.needs).toEqual(['ci', 'targets']);
  expect(jobs.production.needs).toEqual(['ci', 'targets']);
});

test('full source .NET browser qualification has its own selected pinned uncached worker and owned database', () => {
  const workflow = readWorkflow('pr-main');
  const job = workflow.jobs['dotnet-source-browser'];

  expect(job).toBeDefined();
  expect(job.needs).toEqual(['ci']);
  expect(job.if).toBe(
    "${{ !cancelled() && needs.ci.result == 'success' && needs.ci.outputs.dotnet == 'true' }}",
  );
  expect(job['runs-on']).toBe('ubuntu-latest');
  expect(job['timeout-minutes']).toBe(300);
  expect(job.env).toMatchObject({
    DOTNET_TEST_POSTGRES: workflow.jobs.ci.env.DOTNET_TEST_POSTGRES,
    HASHBROWN_DOTNET_HOST_MODE: 'source',
    NX_NO_CLOUD: 'true',
    NX_DAEMON: 'false',
    NX_PARALLEL: '1',
    PLAYWRIGHT_JSON_OUTPUT_FILE:
      'test-results/dotnet-source-browser/report.json',
  });
  const steps = job.steps as {
    name?: string;
    uses?: string;
    with?: Record<string, unknown>;
    run?: string;
    if?: string;
  }[];
  expect(
    steps.find((step) => step.uses === 'actions/checkout@v7')?.with?.[
      'persist-credentials'
    ],
  ).toBe(false);
  expect(
    steps.find((step) => step.uses === 'actions/setup-node@v7')?.with?.[
      'node-version-file'
    ],
  ).toBe('.nvmrc');
  expect(
    steps.find((step) => step.uses === 'actions/setup-dotnet@v6')?.with?.[
      'dotnet-version'
    ],
  ).toBe('10.0.402');
  expect(steps.some((step) => step.run === 'npm ci')).toBe(true);
  const scripts = steps.map((step) => step.run ?? '').join('\n');
  expect(scripts).toContain('postgres:18');
  expect(scripts).toContain('--name hashbrown-postgres-source');
  expect(scripts).toContain(
    'docker exec hashbrown-postgres-source pg_isready -U postgres',
  );
  expect(scripts).toContain('npx playwright install chromium');
  const sourceRun = steps.find((step) =>
    step.run?.includes('npx nx provider-e2e'),
  );
  expect(sourceRun?.run).toBe(
    'npx nx provider-e2e dotnet-conformance --skipNxCache --reporter=list,json',
  );
  expect(scripts).not.toMatch(
    /--grep|--project|--shard|--retries|--timeout|--smoke|--pilot|--regressions|live-provider|nx affected/,
  );
  const upload = steps.find(
    (step) => step.uses === 'actions/upload-artifact@v7',
  );
  expect(upload?.if).toBe('always()');
  expect(upload?.with?.name).toBe('dotnet-source-browser');
  expect(upload?.with?.path).toContain('test-results/dotnet-source-browser');
  expect(upload?.with?.path).toContain('test-results/conformance/dotnet');
  expect(upload?.with?.path).toContain('playwright-report/conformance/dotnet');
  expect(upload?.with?.['if-no-files-found']).toBe('error');
  expect(
    steps.some(
      (step) =>
        step.if === 'always()' &&
        step.run?.includes('docker rm --force hashbrown-postgres-source'),
    ),
  ).toBe(true);
  expect(JSON.stringify(job)).not.toMatch(
    /secrets\.|secrets:|deployments|NX_CLOUD_ACCESS_TOKEN|HASHBROWN_DOTNET_CONSUMER_METADATA|candidate-consumer|prepare-live-consumer/,
  );
});

test('actual PR Gate Bash requires both independent .NET results and rejects unknown affected selections', () => {
  const { jobs } = readWorkflow('pr-main');
  const step = jobs['pr-gate'].steps[0];
  const execute = (
    required: string,
    candidate: string,
    source: string,
    ci = 'success',
  ) => {
    try {
      execFileSync('bash', ['-c', step.run], {
        env: {
          PATH: process.env['PATH'],
          CI_RESULT: ci,
          TARGETS_RESULT: 'skipped',
          PREVIEW_RESULT: 'skipped',
          CANDIDATE_REQUIRED: required,
          CANDIDATE_RESULT: candidate,
          SOURCE_BROWSER_RESULT: source,
        },
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  };

  for (const selection of ['true', 'false', '', 'invalid'])
    for (const candidate of ['success', 'failure', 'cancelled', 'skipped', ''])
      for (const source of ['success', 'failure', 'cancelled', 'skipped', '']) {
        const expected =
          selection === 'true'
            ? candidate === 'success' && source === 'success'
            : selection === 'false' &&
              ['success', 'skipped'].includes(candidate) &&
              ['success', 'skipped'].includes(source);
        expect({
          selection,
          candidate,
          source,
          passed: execute(selection, candidate, source),
        }).toEqual({ selection, candidate, source, passed: expected });
      }
  expect(step.env.SOURCE_BROWSER_RESULT).toBe(
    '${{ needs.dotnet-source-browser.result }}',
  );
  for (const ci of ['failure', 'cancelled', 'skipped', ''])
    expect(execute('true', 'success', 'success', ci)).toBe(false);
});

test('feature dispatch retains full affected graph selection without weakening the eight-project source browser contract', () => {
  const workflow = readWorkflow('pr-main');
  const selection = workflow.jobs.ci.steps.find(
    (step: { id?: string }) => step.id === 'setup',
  );
  const config = readFileSync(
    'tools/conformance/dotnet/dotnet.playwright.config.ts',
    'utf8',
  );
  const project = JSON.parse(
    readFileSync('tools/conformance/dotnet/project.json', 'utf8'),
  );

  expect(workflow.on.workflow_dispatch).toBeNull();
  expect(selection.run).toContain(
    'npx nx affected -t lint,test,typecheck,build,e2e,install-pack-e2e,example-e2e,package-pr-acceptance --graph=',
  );
  expect(selection.run).toContain('select-ci-setup.ts');
  expect(workflow.jobs.targets.if).toContain("github.ref == 'refs/heads/main'");
  expect(workflow.jobs.production.if).toContain(
    "github.ref == 'refs/heads/main'",
  );
  expect(
    selectCiSetup(['core:build', 'dotnet-conformance:build']),
  ).toMatchObject({ dotnet: true });
  expect(selectCiSetup(['core:build', 'www:build'])).toMatchObject({
    dotnet: false,
  });
  expect(
    selectCiSetup(['dotnet-conformance:package-pr-acceptance']),
  ).toMatchObject({ dotnet: true, browser: true });
  expect(project.targets['provider-e2e'].cache).toBe(false);
  expect(project.targets['provider-e2e'].options.command).toBe(
    'playwright test --config tools/conformance/dotnet/dotnet.playwright.config.ts',
  );
  expect(project.targets['provider-e2e'].dependsOn).toContainEqual({
    projects: ['runtime-smoke-react', 'runtime-smoke-angular'],
    target: 'build',
  });
  for (const contract of [
    "testDir: resolve(__dirname, 'specs')",
    'workers: 1',
    'retries: 0',
    'timeout: 30_000',
    'expect: { timeout: 5_000 }',
    "['chat-completions', 'responses']",
    "['react', 'angular']",
    "['openai', 'azure']",
  ])
    expect(config).toContain(contract);
  expect(config).not.toMatch(/testMatch:|grep:|shard:|fullyParallel: true/);
});

test('all four non-release .NET jobs install only the exact historical SDK into an isolated root', () => {
  const validation = readWorkflow('pr-main');
  const nightly = readWorkflow('nightly');
  const currentSdk = JSON.parse(
    readFileSync('tools/conformance/dotnet/global.json', 'utf8'),
  ).sdk;
  const historical = readFileSync(
    'tools/conformance/dotnet/nuget-consumer/published-recovery-baseline.mjs',
    'utf8',
  );
  const jobs = [
    validation.jobs.ci,
    validation.jobs['candidate-cold-recovery'],
    validation.jobs['dotnet-source-browser'],
    nightly.jobs.dotnet,
  ];
  const dependencyPaths = [
    [
      'tools/conformance/dotnet/packages.lock.json',
      'packages/dotnet/packages.lock.json',
      'tools/conformance/dotnet/global.json',
      'packages/dotnet/global.json',
      'tools/conformance/dotnet/tests/fixtures/pre-extraction-host.json',
    ],
    [
      'tools/conformance/dotnet/packages.lock.json',
      'packages/dotnet/packages.lock.json',
      'tools/conformance/dotnet/global.json',
      'packages/dotnet/global.json',
      'tools/conformance/dotnet/tests/fixtures/pre-extraction-host.json',
    ],
    [
      'tools/conformance/dotnet/packages.lock.json',
      'packages/dotnet/packages.lock.json',
      'tools/conformance/dotnet/global.json',
      'packages/dotnet/global.json',
      'tools/conformance/dotnet/tests/fixtures/pre-extraction-host.json',
    ],
    ['tools/conformance/dotnet/packages.lock.json'],
  ];

  expect(currentSdk.version).toBe('10.0.402');
  expect(currentSdk.rollForward).toBe('latestPatch');
  expect(historical).toContain("'10.0.402'");
  expect(historical).toContain(
    'Historical helper SDK must be exactly 10.0.402',
  );
  for (const [index, job] of jobs.entries()) {
    const setupSteps = job.steps.filter((step: { uses?: string }) =>
      step.uses?.startsWith('actions/setup-dotnet@'),
    );
    expect(setupSteps).toHaveLength(1);
    const setup = setupSteps[0];

    expect(setup.uses).toBe('actions/setup-dotnet@v6');
    expect(setup.env).toEqual({
      DOTNET_INSTALL_DIR: '${{ runner.temp }}/hashbrown-dotnet-sdk',
    });
    expect(setup.with['dotnet-version']).toBe(currentSdk.version);
    expect(Object.keys(setup.with).sort()).toEqual([
      'cache',
      'cache-dependency-path',
      'dotnet-version',
    ]);
    expect(setup.with.cache).toBe(true);
    expect(setup.with['cache-dependency-path'].trim().split(/\r?\n/)).toEqual(
      dependencyPaths[index],
    );
  }
  expect(
    jobs[0].steps.find(
      (step: { uses?: string }) => step.uses === 'actions/setup-dotnet@v6',
    ).if,
  ).toBe("steps.setup.outputs.dotnet == 'true'");
});
