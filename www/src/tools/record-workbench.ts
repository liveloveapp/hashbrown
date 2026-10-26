/** Records the verified live lesson clients and publishes their local documentation media. */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.env['OPENAI_API_KEY'] || !process.env['OPENAI_MODEL'])
  throw new Error(
    'Recording requires server-only OPENAI_API_KEY and OPENAI_MODEL.',
  );
const work = resolve(
  'dist/docs-workbench/captures',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
const run = spawnSync(
  process.execPath,
  ['dist/docs-workbench/node/verify-workbench.mjs'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      WORKBENCH_LIVE: '1',
      WORKBENCH_RECORD: '1',
      WORKBENCH_OUTPUT: work,
    },
  },
);
if (run.status !== 0)
  throw new Error('Live verification failed; no media published.');
const reports = JSON.parse(
  readFileSync(resolve(work, 'live-report.json'), 'utf8'),
) as {
  framework: 'react' | 'angular';
  lesson: string;
  source: string;
  passed: boolean;
  phases: Record<string, number>;
}[];
const names: Record<string, string> = {
  'generative-ui': 'ui',
  tools: 'tools',
  'structured-output': 'structured',
};
const timestamp = (seconds: number) =>
  new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
for (const report of reports) {
  if (!report.passed || report.source !== 'provider' || !names[report.lesson])
    throw new Error(
      'Only successful allowlisted provider recordings can be published.',
    );
  const id = `canonical-workbench-${names[report.lesson]}-${report.framework}`;
  const raw = resolve(work, `${report.framework}-${report.lesson}-live.webm`);
  const base = resolve('www/public/video/docs', id);
  for (const [extension, codec] of [
    [
      'mp4',
      [
        '-c:v',
        'libx264',
        '-crf',
        '22',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
      ],
    ],
    [
      'webm',
      [
        '-c:v',
        'libvpx-vp9',
        '-crf',
        '32',
        '-b:v',
        '0',
        '-cpu-used',
        '4',
        '-threads',
        '4',
        '-row-mt',
        '1',
      ],
    ],
  ] as const) {
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        raw,
        '-vf',
        'setpts=2*PTS',
        '-r',
        '30',
        '-an',
        ...codec,
        `${base}.${extension}`,
      ],
      { stdio: 'inherit' },
    );
  }
  const duration = Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        `${base}.mp4`,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    String(Math.min(duration - 0.1, (report.phases['firstComplete'] ?? 2) * 2)),
    '-i',
    `${base}.mp4`,
    '-frames:v',
    '1',
    `${base}-poster.png`,
  ]);
  copyFileSync(
    resolve(work, `${report.framework}-${report.lesson}-live.png`),
    `${base}-result.png`,
  );
  const cues = [
    [
      0,
      report.phases['firstComplete'],
      report.lesson === 'tools'
        ? 'The model calls readContext. Hashbrown returns browser state in a continuation.'
        : 'Real model output streams through Hashbrown into the plan preview.',
    ],
    [
      report.phases['firstComplete'],
      report.phases['followup'],
      'Review the completed plan. Accept plan updates application state to revision 1.',
    ],
    [
      report.phases['followup'],
      report.phases['replay'],
      'The follow-up reads the accepted plan and proposes a shorter second step.',
    ],
    [
      report.phases['replay'],
      report.phases['returnedLive'],
      'Replay follows captured chat, JSON, UI and state. It makes no new requests.',
    ],
    [
      report.phases['returnedLive'],
      duration / 2,
      'Return to live to continue the conversation. The accepted plan stays at revision 1.',
    ],
  ] as const;
  const vtt =
    'WEBVTT\n\n' +
    cues
      .filter(
        ([from, to]) =>
          Number.isFinite(from) && Number.isFinite(to) && to > from,
      )
      .map(
        ([from, to, text]) =>
          `${timestamp(from * 2)} --> ${timestamp(Math.min(duration, to * 2))}\n${text}\n`,
      )
      .join('\n');
  writeFileSync(`${base}.vtt`, vtt);
  writeFileSync(
    `${base}-transcript.txt`,
    `${report.framework.toUpperCase()} · ${report.lesson}\n\nThis is a real provider recording of the checked canonical workbench. Footage is slowed to half speed for readability. There is no narration.\n\n${cues.map(([, , text]) => text).join('\n\n')}\n\nThe source is OpenAI through the real Hashbrown SDK, including the browser readContext tool. ${report.lesson === 'structured-output' ? 'The structured-chat API returns plain typed data; the application renders the card.' : 'The UI-chat API renders the exposed SummaryCard from resolved props.'} Accept plan is an explicit application action. Refresh clears local sessions.\n`,
  );
  if (report.lesson === 'generative-ui') {
    for (const suffix of [
      '.mp4',
      '.webm',
      '.vtt',
      '-poster.png',
      '-result.png',
      '-transcript.txt',
    ])
      copyFileSync(
        base + suffix,
        resolve(
          'www/public/video/docs',
          `canonical-workbench-${report.framework}${suffix}`,
        ),
      );
  }
  console.log(`${id}: ${duration.toFixed(2)}s; provider source verified`);
}
