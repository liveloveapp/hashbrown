import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertPackageIdentities,
  type PackageIdentity,
} from '../harness/package-reporter';

const baseline = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/package-identities.json'), 'utf8'),
);

test('preserves all 664 reviewed original project/file/title identities', () => {
  const identities = baseline.identities as PackageIdentity[];

  expect(() => assertPackageIdentities(identities, identities)).not.toThrow();

  expect(identities).toHaveLength(664);
  expect(new Set(identities.map((row) => row[0])).size).toBe(8);
  expect(baseline.baseline).toBe('8f0a710a75cb907c1a07e34eb5527b1834da90ed');
});

for (const change of ['missing', 'duplicate', 'changed-title'])
  test(`rejects ${change} identities even when count alone could pass`, () => {
    const expected = baseline.identities as PackageIdentity[];
    const actual = expected.slice();
    if (change === 'missing') actual.pop();
    if (change === 'duplicate') actual[0] = actual[1];
    if (change === 'changed-title')
      actual[0] = [actual[0][0], actual[0][1], 'changed'];

    expect(() => assertPackageIdentities(actual, expected)).toThrow(
      /identities/,
    );
  });

import { execFileSync } from 'node:child_process';

test('package config lists the exact original eight projects metadata and 664 identities', () => {
  const list = (config: string) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          resolve('node_modules/playwright/cli.js'),
          'test',
          '--config',
          resolve(__dirname, '..', config),
          '--list',
          '--reporter=json',
        ],
        {
          encoding: 'utf8',
          timeout: 20_000,
          env: {
            ...process.env,
            JEST_WORKER_ID: undefined,
            HASHBROWN_DOTNET_HOST_MODE: 'package',
            HASHBROWN_DOTNET_CONSUMER_METADATA: '/explicit/list-only',
            HASHBROWN_DOTNET_CONSUMER_SHA256: 'a'.repeat(64),
            HASHBROWN_LOCAL_NATIVE_CONSUMER_METADATA: '/explicit/list-only',
            HASHBROWN_PACKAGE_REACT_URL: 'http://127.0.0.1:4432',
            HASHBROWN_PACKAGE_ANGULAR_URL: 'http://127.0.0.1:4431',
          },
        },
      ),
    );
  const original = list('dotnet.playwright.config.ts');
  const packaged = list('package.playwright.config.ts');
  const identities = (report: { suites: unknown[] }) => {
    const rows: PackageIdentity[] = [];
    const walk = (suite: {
      suites?: unknown[];
      specs?: Array<{
        file: string;
        title: string;
        tests: Array<{ projectName: string }>;
      }>;
    }) => {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests)
          rows.push([test.projectName, spec.file, spec.title]);
      for (const child of suite.suites ?? [])
        walk(child as Parameters<typeof walk>[0]);
    };
    walk(report);
    return rows;
  };

  assertPackageIdentities(identities(original), baseline.identities);
  assertPackageIdentities(identities(packaged), baseline.identities);

  const projects = (report: typeof packaged) =>
    report.config.projects.map(
      (project: { name: string; metadata: unknown }) => [
        project.name,
        project.metadata,
      ],
    );
  expect(projects(packaged)).toEqual(projects(original));
}, 45_000);
