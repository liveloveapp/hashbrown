import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const workflow = () =>
  readFileSync(
    resolve(import.meta.dirname, '../../.github/workflows/deploy.yml'),
    'utf8',
  );
const step = (source: string, name: string) =>
  source.split(`- name: ${name}\n`)[1]?.split('\n      - name: ')[0] ?? '';

test('only successful production www uploads run the remote docs audit before recording deployment success', () => {
  const source = workflow();
  const verification = step(source, 'Verify production documentation');

  expect(verification).toContain("matrix.key == 'www'");
  expect(verification).toContain("inputs.environment == 'production'");
  expect(verification).toContain("steps.deploy.outcome == 'success'");
  expect(verification).toContain('npx nx verify-deployment www');
  expect(verification).toContain('steps.deploy.outputs.url');
  expect(verification).toContain('inputs.ref');
  expect(
    source.indexOf('- name: Verify production documentation'),
  ).toBeLessThan(source.indexOf('- name: Record deployment status'));
});

test('the actual Vercel build receives the expected full revision and failed audits retain diagnostics', () => {
  const source = workflow();

  expect(step(source, 'Build with Vercel')).toContain(
    'VERCEL_GIT_COMMIT_SHA: ${{ inputs.ref }}',
  );
  expect(
    step(source, 'Upload production documentation verification'),
  ).toContain('always()');
  expect(
    step(source, 'Upload production documentation verification'),
  ).toContain('dist/docs-deployment');
  expect(step(source, 'Record deployment status')).toContain(
    'steps.docs-verification.outcome',
  );
  expect(step(source, 'Record deployment status')).toContain(
    'docs-deployment-status.ts',
  );
  expect(step(source, 'Record deployment status')).toContain(
    "DEPLOYMENT_CANCELLED: ${{ job.status == 'cancelled' }}",
  );
});

test('remote verification is an uncached Nx target without a local build dependency', () => {
  const project = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../project.json'), 'utf8'),
  );
  const target = project.targets['verify-deployment'];

  expect(target).toMatchObject({
    cache: false,
    options: { command: 'tsx www/src/tools/verify-docs-deployment.ts' },
  });
  expect(target.dependsOn ?? []).toEqual([]);
});
