/** Verify the uploaded artifact and production alias, retaining provenance on failure. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  diagnosticOrigin,
  type DocsDeploymentIdentity,
  verifyPublishedDocs,
} from '../lib/docs-deployment';
import { repoRoot } from '../lib/repo-root';

const root = repoRoot();
const output = resolve(
  root,
  process.env.DOCS_DEPLOYMENT_OUTPUT ?? 'dist/docs-deployment',
);
const expectedRevision = process.env.DOCS_DEPLOYMENT_REVISION ?? '';
const immutableOrigin = process.env.DOCS_DEPLOYMENT_URL ?? '';
const productionOrigin =
  process.env.DOCS_PRODUCTION_ORIGIN ?? 'https://hashbrown.dev';
const startedAt = new Date().toISOString();
let observations: readonly {
  readonly phase: 'before' | 'after';
  readonly identity: DocsDeploymentIdentity;
}[] = [];
let passed = false;
let fatalError: string | undefined;
await mkdir(output, { recursive: true });
try {
  await verifyPublishedDocs({
    immutableOrigin,
    productionOrigin,
    expectedRevision,
    onIdentity: (phase, identity) => {
      observations = [...observations, { phase, identity }];
    },
    audit: (origin) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', join(root, 'www/src/tools/diagram-report.ts')],
          {
            cwd: root,
            env: {
              ...process.env,
              DOCS_DIAGRAM_ORIGIN: origin,
              DOCS_DIAGRAM_EXPECTED_REVISION: expectedRevision,
              DOCS_DIAGRAM_OUTPUT: join(output, 'diagrams'),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        let logs = '';
        for (const stream of [child.stdout, child.stderr])
          stream?.on('data', (chunk) => {
            logs = (logs + String(chunk)).slice(-50000);
            process.stdout.write(chunk);
          });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
          void writeFile(join(output, 'browser.log'), logs).then(() => {
            if (code === 0) resolve();
            else
              reject(
                new Error(
                  `Production diagram audit failed (${signal ?? code}); inspect diagrams/report.json and browser.log`,
                ),
              );
          }, reject);
        });
      }),
  });
  passed = true;
  console.log(
    `Production documentation verified at ${productionOrigin} for ${expectedRevision}`,
  );
} catch (error) {
  fatalError = error instanceof Error ? error.message : String(error);
  console.error(fatalError);
  process.exitCode = 1;
} finally {
  await writeFile(
    join(output, 'verification.json'),
    JSON.stringify(
      {
        expectedRevision,
        immutableOrigin: diagnosticOrigin(immutableOrigin),
        productionOrigin: diagnosticOrigin(productionOrigin),
        startedAt,
        finishedAt: new Date().toISOString(),
        passed,
        observations,
        fatalError,
      },
      null,
      2,
    ),
  );
}
