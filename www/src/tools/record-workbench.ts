/** Records the verified live lesson clients and publishes their local documentation media. */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { workbenchOnboardingRecordingCues } from './workbench-onboarding-recording';
import { workbenchRecipeRecordingCues } from './workbench-recording-cues';

if (!process.env['OPENAI_API_KEY'] || !process.env['OPENAI_MODEL'])
  throw new Error(
    'Recording requires server-only OPENAI_API_KEY and OPENAI_MODEL.',
  );
if (
  (process.env['WORKBENCH_LESSONS'] ?? 'decisions')
    .split(',')
    .some((lesson) => ['decisions', 'ui-selection'].includes(lesson)) &&
  (!process.env['TYPESAFE_API_KEY'] || !process.env['TYPESAFE_MODEL'])
)
  throw new Error(
    'Decision recordings require server-only TYPESAFE_API_KEY and TYPESAFE_MODEL.',
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
  provider?: string;
  firstManualChoice?: boolean;
}[];
const names: Record<string, string> = {
  'first-plan': 'first-plan',
  conversation: 'conversation',
  'system-instructions': 'system-instructions',
  'generative-ui': 'ui',
  tools: 'tools',
  'structured-output': 'structured',
  streaming: 'streaming',
  schemas: 'schemas',
  decisions: 'decisions',
  'magic-text': 'magic-text',
  predictions: 'predictions',
  'ui-selection': 'ui-selection',
  debugging: 'debugging',
  'request-transformation': 'request-transformation',
};
const timestamp = (seconds: number) =>
  new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
for (const report of reports) {
  if (!report.passed || report.source !== 'provider' || !names[report.lesson])
    throw new Error(
      'Only successful allowlisted provider recordings can be published.',
    );
  if (
    ['decisions', 'ui-selection'].includes(report.lesson) &&
    report.provider !== 'typesafe'
  )
    throw new Error(
      'Decision footage must come from the real TypeSafe adapter.',
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
  const cues =
    workbenchOnboardingRecordingCues(report, duration) ??
    workbenchRecipeRecordingCues(report, duration) ??
    ([
      ...(report.lesson === 'debugging'
        ? ([
            [
              0,
              report.phases['recovery'],
              'A deliberate local HTTP 403 denies the request before provider work. The plan stays at revision 0.',
            ],
          ] as const)
        : []),
      [
        report.lesson === 'debugging' ? report.phases['recovery'] : 0,
        report.phases['firstComplete'],
        report.lesson === 'decisions'
          ? 'A complete TypeSafe decision returns a known next action and confidence. It does not stream text.'
          : report.lesson === 'debugging'
            ? 'Disable Demo denial and retry in the same conversation. Real model output now streams into the trusted plan card.'
            : report.lesson === 'request-transformation'
              ? 'The actual provider callback adds server-owned instructions while preserving the mapped model, tools and response schema.'
              : report.lesson === 'schemas'
                ? 'The shared response contract stays visible beside the SDK-resolved plan preview.'
                : report.lesson === 'tools'
                  ? 'The model calls readContext. Hashbrown returns browser state in a continuation.'
                  : 'Real model output streams through Hashbrown into the plan preview.',
      ],
      [
        report.phases['firstComplete'],
        report.phases['followup'],
        report.lesson === 'decisions'
          ? 'Review the typed choice. Use suggestion saves nextAction and advances the application revision to 1.'
          : 'Review the completed plan. Accept plan updates application state to revision 1.',
      ],
      [
        report.phases['followup'],
        report.phases['replay'],
        report.lesson === 'decisions'
          ? 'The next input says the demo is recorded. The decision suggests review using the current application snapshot.'
          : 'The follow-up reads the accepted plan and proposes a shorter second step.',
      ],
      [
        report.phases['replay'],
        report.phases['returnedLive'],
        report.lesson === 'decisions'
          ? 'Replay follows complete choices, confidence and state. It makes no decision requests or writes.'
          : 'Replay follows captured chat, JSON, UI and state. It makes no new requests.',
      ],
      [
        report.phases['returnedLive'],
        duration / 2,
        report.lesson === 'decisions'
          ? 'Return to live to continue. The chosen next action stays at revision 1.'
          : 'Back live. The accepted plan remains at revision 1.',
      ],
    ] as const);
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
    `${report.framework.toUpperCase()} · ${report.lesson}\n\nThis is a real provider recording of the checked canonical workbench. Footage is slowed to half speed for readability. ${['decisions', 'ui-selection'].includes(report.lesson) ? 'Decision responses arrive whole.' : 'Unchanged provider events are paced at 20 milliseconds for filming; the normal host does not add this delay.'} ${report.lesson === 'debugging' ? 'The initial HTTP 403 is a deliberate local demo denial before provider work, not authentication or a provider failure. Recovery uses the same SDK conversation.' : report.lesson === 'request-transformation' ? 'The sanitized transformation trace is captured inside the actual provider callback after request mapping.' : ''} There is no narration.\n\n${cues.map(([, , text]) => text).join('\n\n')}\n\n${['first-plan', 'conversation', 'system-instructions'].includes(report.lesson) ? `The source is OpenAI through the real Hashbrown SDK. No browser tools are registered and application state stays at revision 0. ${report.lesson === 'first-plan' ? 'The UI chat renders the exposed SummaryCard as a preview with no acceptance action.' : report.lesson === 'conversation' ? 'Plain text chat retains earlier messages, a stable conversation ID and a fresh run ID for each turn. Local history is not durable storage.' : 'The browser garden declaration is replaced by the fixed server application policy. Public policy evidence is captured from the actual OpenAI adapter mapping callback on both turns. Instructions do not authorize application actions.'}` : report.lesson === 'ui-selection' ? 'The source is TypeSafe through the real Hashbrown UI decision SDK. The application owns the plan, candidate components and props. The model chooses a known ID. Use view is explicit; low confidence and failures preserve state and offer manual choice. The recording finishes with an explicit manual steps choice at revision 2, without lowering the model-confidence threshold.' : report.lesson === 'decisions' ? 'The source is TypeSafe through the real Hashbrown decision SDK. The application supplies the fixed plan; the model selects only record, review or clarify. Confidence below 0.75, errors and cancellation preserve state and show manual review guidance. Use suggestion is an explicit application action.' : `The source is OpenAI through the real Hashbrown SDK${report.lesson === 'predictions' ? '. This completion registers no browser tools' : ', including the browser readContext tool'}. ${report.lesson === 'magic-text' ? 'The text-chat API streams plain Markdown into the real SDK Magic Text renderer. The supplied source is a reference, not proof of retrieval or correctness. The plan remains unchanged.' : report.lesson === 'predictions' ? 'The structured-completion API receives an explicit current-context snapshot. Only fresh completed validated proposals can be accepted; dismissal does not apply an action. The model does not execute code or invent catalogue IDs.' : ['structured-output', 'streaming', 'schemas'].includes(report.lesson) ? 'The structured-chat API returns plain typed data; the application renders the card.' : 'The UI-chat API renders the exposed SummaryCard from resolved props.'} ${['magic-text', 'predictions'].includes(report.lesson) ? '' : 'Accept plan is an explicit application action.'}`} Refresh clears local sessions.\n`,
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
