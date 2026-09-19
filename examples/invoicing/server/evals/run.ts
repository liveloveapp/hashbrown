/**
 * Runs every `src/app/assistant/evals/*.eval.ts` through the in-process
 * harness. Replay (the default) needs a recorded fixture file beside each
 * eval; `--record` creates them against the real model; `--live` skips
 * fixtures entirely.
 *
 *   tsx evals/run.ts [--live | --record] [--json [file]] [filter]
 */
import {
  type EvalCase,
  type EvalDefinition,
  type EvalReport,
  runEval,
} from '@b4run/evals';
import { loadFixtures, writeFixtures } from '@b4run/testing';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { siblingFixturePath } from './fixtures';
import { createInvoicingHarness, type HarnessMode } from './harness';

const serverRoot = fileURLToPath(new URL('..', import.meta.url));
const evalsDir = join(serverRoot, 'src/app/assistant/evals');

const USAGE = `Usage: nx run invoicing-server:eval -- [options] [filter]

  filter            substring of an eval file name or a case name
  --live            run against the real model without touching fixtures
  --record          run against the real model and write replay fixtures
  --json [file]     write the reports as JSON (default .b4/eval-report.json)
  --help            show this help`;

interface Args {
  mode: HarnessMode;
  json?: string;
  filter?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { mode: 'replay' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--live' || arg === '--record') {
      const mode = arg.slice(2) as HarnessMode;
      if (args.mode !== 'replay' && args.mode !== mode)
        throw new Error('--live and --record are mutually exclusive');
      args.mode = mode;
    } else if (arg === '--json') {
      const next = argv[i + 1];
      args.json =
        next && !next.startsWith('-')
          ? (i++, next)
          : join(serverRoot, '.b4/eval-report.json');
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option ${arg}\n${USAGE}`);
    } else if (args.filter) {
      throw new Error(`only one filter is accepted, got "${arg}" too`);
    } else {
      args.filter = arg;
    }
  }
  return args;
}

function matches(filter: string | undefined, ...names: readonly string[]) {
  return !filter || names.some((n) => n.toLowerCase().includes(filter));
}

function printReport(report: EvalReport) {
  console.log(`\n${report.name}`);
  for (const c of report.cases) {
    console.log(`  ${c.passed ? 'PASS' : 'FAIL'} ${c.name}`);
    for (const s of c.scores) {
      const reason = s.reason ? `  (${s.reason})` : '';
      console.log(`       ${s.score.toFixed(2)} ${s.scorer}${reason}`);
    }
  }
  const verdict = !report.gated
    ? 'informational'
    : report.passed
      ? 'gate passed'
      : `gate FAILED${report.reason ? `: ${report.reason}` : ''}`;
  console.log(`  mean ${report.mean.toFixed(2)}, ${verdict}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evalFiles = readdirSync(evalsDir)
    .filter((f) => f.endsWith('.eval.ts'))
    .map((f) => join(evalsDir, f));
  if (evalFiles.length === 0) throw new Error(`no *.eval.ts in ${evalsDir}`);

  const harness = await createInvoicingHarness({ mode: args.mode });
  const reports: EvalReport[] = [];
  let failed = false;
  try {
    for (const evalFile of evalFiles) {
      const definition = (
        (await import(pathToFileURL(evalFile).href)) as {
          default: EvalDefinition;
        }
      ).default;
      // Only an inline dataset can be filtered by case name; a path or a
      // factory is handed to runEval untouched.
      const dataset = definition.dataset;
      const filtered = Array.isArray(dataset)
        ? (dataset as readonly EvalCase[]).filter((c) =>
            matches(args.filter, evalFile, definition.name, c.name ?? ''),
          )
        : dataset;
      if (Array.isArray(filtered) && filtered.length === 0) continue;

      let index = -1;
      const runCase = async (testCase: EvalCase) => {
        index += 1;
        const { input, name } = testCase;
        if (typeof input !== 'string')
          throw new Error(`case "${name}" input must be a string`);
        const sibling = siblingFixturePath(evalFile, name, index);
        if (args.mode === 'replay') {
          const own = testCase.fixtures;
          const fixtures = own
            ? Array.isArray(own)
              ? own
              : own.build()
            : existsSync(sibling)
              ? loadFixtures(sibling)
              : undefined;
          if (!fixtures)
            throw new Error(
              `case "${name}" has no fixtures: ${relative(serverRoot, sibling)} does not exist. ` +
                'Run with --record to create it, or --live to skip fixtures.',
            );
          return harness.run({ input, fixtures });
        }
        const run = await harness.run({ input });
        if (args.mode === 'record') {
          const recorded = harness.lastRecordedFixtures();
          writeFixtures(sibling, recorded);
          console.log(
            `  recorded ${recorded.length} fixture(s) to ${relative(serverRoot, sibling)}`,
          );
        }
        return run;
      };

      try {
        const report = await runEval(
          { ...definition, dataset: filtered },
          { baseDir: dirname(evalFile), runCase },
        );
        reports.push(report);
        printReport(report);
        if (report.gated && !report.passed) failed = true;
      } catch (error) {
        failed = true;
        console.error(
          `\n${definition.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    await harness.close();
  }

  if (args.json) {
    mkdirSync(dirname(args.json), { recursive: true });
    writeFileSync(args.json, JSON.stringify(reports, null, 2));
    console.log(`\nwrote ${relative(serverRoot, args.json)}`);
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
