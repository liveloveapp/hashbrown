/** One scenario run's timings, in milliseconds. */
export interface PerfRun {
  /** Navigation to the first dashboard figures. */
  readonly dashboardData: number;
  /** The snapshot response's Server-Timing phases, e.g. `{ init: 3, snapshot: 12 }`. */
  readonly snapshotServer: Readonly<Record<string, number>>;
  /** Per question: send to the first answer text, and to the settled answer. */
  readonly questions: readonly {
    readonly question: string;
    readonly firstText: number;
    readonly settled: number;
  }[];
  /** Review match to an approval card that can be approved. */
  readonly approvalCard: number;
  /** Approve and apply to the visible "Applied $…" outcome. */
  readonly applied: number;
}

/** The median of some numbers; NaN for none. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Parse a `Server-Timing` header (`init;dur=3.1, snapshot;dur=12`) into durations. */
export function parseServerTiming(
  header: string | null,
): Record<string, number> {
  const phases: Record<string, number> = {};
  for (const entry of (header ?? '').split(',')) {
    const [name, ...params] = entry.trim().split(';');
    const dur = params.find((p) => p.trim().startsWith('dur='));
    if (name && dur) phases[name] = Number(dur.trim().slice(4));
  }
  return phases;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/**
 * The medians of several runs as the Markdown table PR descriptions quote:
 * one row per moment, plus one per question.
 */
export function summarize(runs: readonly PerfRun[]): string {
  const rows: [string, number][] = [
    ['Dashboard data', median(runs.map((r) => r.dashboardData))],
    ...Object.keys(runs[0]?.snapshotServer ?? {}).map(
      (phase): [string, number] => [
        `Snapshot server: ${phase}`,
        median(runs.map((r) => r.snapshotServer[phase] ?? Number.NaN)),
      ],
    ),
    ...(runs[0]?.questions ?? []).flatMap((q, i): [string, number][] => [
      [
        `First answer text: ${q.question}`,
        median(runs.map((r) => r.questions[i].firstText)),
      ],
      [
        `Settled answer: ${q.question}`,
        median(runs.map((r) => r.questions[i].settled)),
      ],
    ]),
    ['Approval card', median(runs.map((r) => r.approvalCard))],
    ['Approve to applied', median(runs.map((r) => r.applied))],
  ];
  return [
    `| Moment (median of ${runs.length}) | Time |`,
    '| --- | --- |',
    ...rows.map(([name, ms]) => `| ${name} | ${seconds(ms)} |`),
  ].join('\n');
}
