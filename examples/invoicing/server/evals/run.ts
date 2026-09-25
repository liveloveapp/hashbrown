/**
 * Runs every `src/app/assistant/evals/*.eval.ts` through B4's agent
 * harness. Replay (the default) needs a recorded fixture file beside each
 * eval; `--record` creates them against the real model; `--live` skips
 * fixtures entirely.
 *
 *   tsx evals/run.ts [--live | --record] [--json[=file]] [filter]
 */
import {
  type EvalCase,
  type EvalDefinition,
  type EvalReport,
  resolveDataset,
  runEval,
} from '@b4run/evals';
import { type FixtureSet, loadFixtures, writeFixtures } from '@b4run/testing';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertReplayable, siblingFixturePath } from './fixtures';
import {
  createInvoicingHarness,
  type HarnessMode,
  type InvoicingHarness,
} from './harness';

const serverRoot = fileURLToPath(new URL('..', import.meta.url));
const evalsDir = join(serverRoot, 'src/app/assistant/evals');

const USAGE = `Usage: nx run invoicing-server:eval -- [options] [filter]

  filter            substring of an eval file name or a case name
  --live            run against the real model without touching fixtures
  --record          run against the real model and write replay fixtures
  --json[=file]     write the reports as JSON (default .b4/eval-report.json)
  --help            show this help`;

interface Args {
  mode: HarnessMode;
  json?: string;
  filter?: string;
}

/** A dataset row with its position in the unfiltered dataset. */
interface Selected {
  readonly testCase: EvalCase;
  readonly index: number;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { mode: 'replay' };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--live' || arg === '--record') {
      const mode = arg.slice(2) as HarnessMode;
      if (args.mode !== 'replay' && args.mode !== mode)
        throw new Error('--live and --record are mutually exclusive');
      args.mode = mode;
    } else if (arg === '--json' || arg.startsWith('--json=')) {
      args.json =
        arg.slice('--json='.length) || join(serverRoot, '.b4/eval-report.json');
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option ${arg}\n${USAGE}`);
    } else if (args.filter) {
      throw new Error(`only one filter is accepted, got "${arg}" too`);
    } else {
      args.filter = arg.toLowerCase();
    }
  }
  return args;
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

/** Every selected case's fixtures, or one error naming every missing file. */
function replayFixtures(evalFile: string, selected: readonly Selected[]) {
  const fixtures = new Map<EvalCase, FixtureSet>();
  const missing: string[] = [];
  for (const { testCase, index } of selected) {
    const own = testCase.fixtures;
    const sibling = siblingFixturePath(evalFile, testCase.name, index);
    if (own) fixtures.set(testCase, Array.isArray(own) ? own : own.build());
    else if (existsSync(sibling)) fixtures.set(testCase, loadFixtures(sibling));
    else missing.push(relative(serverRoot, sibling));
  }
  if (missing.length > 0)
    throw new Error(
      `${missing.length} case(s) have no fixtures:\n  ${missing.join('\n  ')}\n` +
        'Run with --record to create them, or --live to skip fixtures.',
    );
  return fixtures;
}

async function runOne(
  harness: InvoicingHarness,
  evalFile: string,
  definition: EvalDefinition,
  args: Args,
): Promise<{ report: EvalReport; refused: string[] } | undefined> {
  const all = await resolveDataset(definition.dataset, dirname(evalFile));
  const selected = all
    .map((testCase, index): Selected => ({ testCase, index }))
    .filter(
      ({ testCase }) =>
        !args.filter ||
        basename(evalFile).toLowerCase().includes(args.filter) ||
        (testCase.name ?? '').toLowerCase().includes(args.filter),
    );
  if (selected.length === 0) return undefined;
  const byCase = new Map(selected.map((s) => [s.testCase, s]));
  const fixtures =
    args.mode === 'replay' ? replayFixtures(evalFile, selected) : undefined;
  if (args.mode === 'record') {
    const unnamed = selected.filter((s) => !s.testCase.name);
    if (unnamed.length > 0)
      throw new Error(
        `cannot record unnamed case(s) at dataset index ${unnamed.map((s) => s.index).join(', ')}: fixture files are named after the case`,
      );
  }

  // Scorers (the LLM judge included) call the model after runCase returns,
  // and the harness tapes everything from a run's start until the next one
  // begins, so a case's tape is cut just before the next case runs and, for
  // the last case, once runEval resolves.
  //
  // A tape replay would reject is refused rather than written, so a broken
  // recording surfaces now instead of on the next replay. Refusals are
  // collected, not thrown, because a tape is cut as the NEXT case starts and
  // throwing there would fail the wrong case.
  let taped: Selected | undefined;
  const refused: string[] = [];
  const cut = async () => {
    if (!taped) return;
    const { testCase, index } = taped;
    taped = undefined;
    const sibling = siblingFixturePath(evalFile, testCase.name, index);
    const recorded = harness.getRecordedFixtures();
    try {
      await assertReplayable(recorded);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      refused.push(`${testCase.name}: ${reason}`);
      console.error(
        `  refused to record ${testCase.name}; no fixture written: ${reason}`,
      );
      return;
    }
    writeFixtures(sibling, recorded);
    console.log(
      `  recorded ${recorded.length} fixture(s) to ${relative(serverRoot, sibling)}`,
    );
  };
  const runCase = async (testCase: EvalCase) => {
    const { input } = testCase;
    if (typeof input !== 'string')
      throw new Error(`case "${testCase.name}" input must be a string`);
    if (args.mode === 'record') {
      await cut();
      taped = byCase.get(testCase);
    }
    return harness.run({ input, fixtures: fixtures?.get(testCase) });
  };
  let report: EvalReport;
  try {
    report = await runEval(
      { ...definition, dataset: selected.map((s) => s.testCase) },
      { baseDir: dirname(evalFile), runCase },
    );
  } finally {
    // Whatever was taped is kept, so a failure on case N does not discard
    // cases 1 to N-1.
    await cut();
  }
  return { report, refused };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evalFiles = readdirSync(evalsDir)
    .filter((f) => f.endsWith('.eval.ts'))
    .sort()
    .map((f) => join(evalsDir, f));
  if (evalFiles.length === 0) throw new Error(`no *.eval.ts in ${evalsDir}`);

  const harness = await createInvoicingHarness({ mode: args.mode });
  const reports: EvalReport[] = [];
  let failed = false;
  try {
    for (const evalFile of evalFiles) {
      const { default: definition } = (await import(
        pathToFileURL(evalFile).href
      )) as { default: EvalDefinition };
      try {
        const outcome = await runOne(harness, evalFile, definition, args);
        if (!outcome) continue;
        const { report, refused } = outcome;
        reports.push(report);
        printReport(report);
        if (report.gated && !report.passed) failed = true;
        if (refused.length > 0) {
          failed = true;
          console.error(
            `\n${definition.name}: refused to record ${refused.length} case(s):\n  ${refused.join('\n  ')}`,
          );
        }
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
