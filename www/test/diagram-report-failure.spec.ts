import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import {
  diagramNavigationIssue,
  diagramRequestIssue,
} from '../src/lib/diagram-checks';

const auditProcessTimeout = 15_000;
// Vitest must allow the child its full deadline plus assertion and cleanup time.
const auditTestTimeout = auditProcessTimeout + 5_000;

test('blocks every mutating browser request and never records URL credentials or query strings', () => {
  const url = 'https://name:secret@example.com/api/chat?api_key=secret';

  expect(diagramRequestIssue('GET', url)).toBeUndefined();
  expect(diagramRequestIssue('HEAD', url)).toBeUndefined();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    expect(diagramRequestIssue(method, url)).toBe(
      `Unexpected ${method}: https://example.com/api/chat`,
    );
  }
});

test(
  'a fatal audit startup error leaves a failed report instead of an empty apparent success',
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'hashbrown-diagram-fatal-'));

    try {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'www/src/tools/diagram-report.ts'],
        {
          cwd: resolve(import.meta.dirname, '../..'),
          env: {
            ...process.env,
            DOCS_DIAGRAM_ORIGIN: 'file:///invalid',
            DOCS_DIAGRAM_OUTPUT: directory,
          },
          encoding: 'utf8',
          timeout: auditProcessTimeout,
        },
      );
      const report = JSON.parse(
        readFileSync(join(directory, 'report.json'), 'utf8'),
      );

      expect(result.status).toBe(1);
      expect(report.passed).toBe(false);
      expect(report.fatalError).toEqual(expect.any(String));
      expect(report.fatalError.length).toBeGreaterThan(0);
      expect(report.origin).toBe('file:');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  auditTestTimeout,
);

test(
  'invalid credential-bearing audit origins never leak credentials in diagnostics',
  () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'hashbrown-diagram-private-origin-'),
    );

    try {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'www/src/tools/diagram-report.ts'],
        {
          cwd: resolve(import.meta.dirname, '../..'),
          env: {
            ...process.env,
            DOCS_DIAGRAM_ORIGIN:
              'https://name:secret@example.com/path?key=secret',
            DOCS_DIAGRAM_OUTPUT: directory,
          },
          encoding: 'utf8',
          timeout: auditProcessTimeout,
        },
      );
      const report = readFileSync(join(directory, 'report.json'), 'utf8');

      expect(result.status).toBe(1);
      expect(report).not.toContain('secret');
      expect(JSON.parse(report).origin).toBe('https://example.com');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  auditTestTimeout,
);

test('a docs redirect cannot silently move the audit to another origin', () => {
  const origin = 'https://hashbrown.dev';

  expect(
    diagramNavigationIssue(origin, `${origin}/docs/react/concept/components`),
  ).toBeUndefined();
  const issue = diagramNavigationIssue(
    origin,
    'https://name:secret@example.com/docs/react/concept/components?key=secret',
  );

  expect(issue).toContain('left audited origin');
  expect(issue).toContain('https://example.com/docs/react/concept/components');
  expect(issue).not.toContain('secret');
});
