import { workbenchLocalRecordingCues } from './workbench-local-recording';
import { workbenchJavaScriptRecordingCues } from './workbench-javascript-recording';
import { workbenchUiRecordingCues } from './workbench-ui-recording';
import { workbenchAuthoringRecordingCues } from './workbench-authoring-recording';
import { workbenchServerRecordingCues } from './workbench-server-recording';
import {
  workbenchHistoryPosterTime,
  workbenchHistoryRecordingCues,
} from './workbench-history-recording';
import {
  workbenchWorkflowPosterTime,
  workbenchWorkflowRecordingCues,
} from './workbench-workflow-recording';
/** Records the verified live lesson clients and publishes their local documentation media. */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  publishWorkbenchMedia,
  workbenchMediaSuffixes,
} from './workbench-media-publication';
import { resolve } from 'node:path';
import { prepareWorkbenchCaptures } from './workbench-capture-file';
import {
  type WorkbenchLessonId,
  workbenchLessons,
} from '../../examples/quickstart/runtime/workbench-lessons';
import { workbenchMediaName } from '../components/workbench/workbench-media';
import { workbenchOnboardingRecordingCues } from './workbench-onboarding-recording';
import {
  validateWorkbenchRecordingCues,
  workbenchRecipeRecordingCues,
} from './workbench-recording-cues';

if (
  !['javascript-runtime', 'local-models'].includes(
    process.env['WORKBENCH_LESSONS'] ?? '',
  ) &&
  (!process.env['OPENAI_API_KEY'] || !process.env['OPENAI_MODEL'])
)
  throw new Error(
    'Recording requires server-only OPENAI_API_KEY and OPENAI_MODEL.',
  );
if (
  (process.env['WORKBENCH_LESSONS'] ?? 'decisions')
    .split(',')
    .some((lesson) =>
      ['decisions', 'ui-selection', 'agent-decisions'].includes(lesson),
    ) &&
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
  agentFallbacks?: readonly boolean[];
  agentConfidences?: readonly number[];
  formFirstStepPreserved?: boolean;
  fallbackObserved?: boolean;
}[];
// Production recovery has its own recorder; every other lesson records here.
const recordable = (lesson: string): lesson is WorkbenchLessonId =>
  lesson !== 'production-recovery' &&
  workbenchLessons.some((item) => item.id === lesson);
// Captures are stamped with the commit the media is published from.
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
// Every capture is checked before any encoding, so one bad lesson fails fast.
const captures = prepareWorkbenchCaptures(work, reports, commit);
const timestamp = (seconds: number) =>
  new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
const staging = resolve(work, 'encoded');
mkdirSync(staging, { recursive: true });
const publishIds: string[] = [];
for (const report of reports) {
  if (
    !report.passed ||
    (report.lesson === 'local-models'
      ? report.source !== 'native-local' ||
        report.provider !== 'chrome-prompt-api'
      : report.lesson === 'javascript-runtime'
        ? report.source !== 'runtime' || report.provider !== 'none'
        : report.source !== 'provider') ||
    !recordable(report.lesson)
  )
    throw new Error(
      'Only successful allowlisted provider recordings can be published.',
    );
  if (
    ['decisions', 'ui-selection', 'agent-decisions'].includes(report.lesson) &&
    report.provider !== 'typesafe'
  )
    throw new Error(
      'Decision footage must come from the real TypeSafe adapter.',
    );
  const timingScale = report.lesson === 'local-models' ? 1 : 2;
  const id = `canonical-workbench-${workbenchMediaName(report.lesson)}-${report.framework}`;
  const raw = resolve(work, `${report.framework}-${report.lesson}-live.webm`);
  const base = resolve(staging, id);
  publishIds.push(id);
  writeFileSync(
    `${base}-capture.json`,
    captures.get(`${report.framework}-${report.lesson}`) ?? '',
  );
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
        `setpts=${timingScale}*PTS`,
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
    String(
      (['ui-kits', 'ui-chatbot'].includes(report.lesson)
        ? (report.phases['firstAccepted'] ?? 2) * 2
        : report.lesson === 'natural-forms'
          ? Math.min(duration - 0.1, report.phases['applied'] * 2 + 0.5)
          : undefined) ??
        workbenchHistoryPosterTime(report, duration) ??
        workbenchWorkflowPosterTime(report, duration) ??
        Math.min(
          duration - 0.1,
          (report.phases['firstComplete'] ?? 2) * timingScale,
        ),
    ),
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
    workbenchLocalRecordingCues(report, duration) ??
    workbenchJavaScriptRecordingCues(report, duration) ??
    workbenchUiRecordingCues(report, duration) ??
    workbenchAuthoringRecordingCues(report, duration) ??
    workbenchServerRecordingCues(report, duration) ??
    workbenchHistoryRecordingCues(report, duration) ??
    workbenchWorkflowRecordingCues(report, duration) ??
    workbenchOnboardingRecordingCues(report, duration) ??
    workbenchRecipeRecordingCues(report, duration) ??
    ([
      ...(report.lesson === 'debugging'
        ? ([
            [
              0,
              report.phases['recovery'],
              'A local 403 stops before the provider. Revision 0.',
            ],
          ] as const)
        : []),
      [
        report.lesson === 'debugging' ? report.phases['recovery'] : 0,
        report.phases['firstComplete'],
        report.lesson === 'decisions'
          ? 'TypeSafe returns a whole decision.'
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
          ? 'Use suggestion: revision 1.'
          : 'Accept plan: application revision 1.',
      ],
      [
        report.phases['followup'],
        report.phases['replay'],
        report.lesson === 'decisions'
          ? 'The next decision suggests review.'
          : 'The follow-up reads the accepted plan and proposes a shorter second step.',
      ],
      [
        report.phases['replay'],
        report.phases['returnedLive'],
        report.lesson === 'decisions'
          ? 'Replay follows complete choices, confidence and state. It makes no decision requests or writes.'
          : 'Replay follows captured chat, JSON, UI and state. It makes no new requests.',
      ],
      [report.phases['returnedLive'], duration / 2, 'Back live. Revision 1.'],
    ] as const);
  validateWorkbenchRecordingCues(cues, duration, timingScale);
  const vtt =
    'WEBVTT\n\n' +
    cues
      .map(
        ([from, to, text]) =>
          `${timestamp(from * timingScale)} --> ${timestamp(to * timingScale)}\n${text}\n`,
      )
      .join('\n');
  writeFileSync(`${base}.vtt`, vtt);
  writeFileSync(
    `${base}-transcript.txt`,
    `${report.framework.toUpperCase()} · ${report.lesson}\n\nThis is a real provider recording of the checked canonical workbench. Footage is slowed to half speed for readability. ${['decisions', 'ui-selection', 'agent-decisions'].includes(report.lesson) ? 'Decision responses arrive whole.' : 'Unchanged provider events are paced at 20 milliseconds for filming; the normal host does not add this delay.'} ${report.lesson === 'debugging' ? 'The initial HTTP 403 is a deliberate local demo denial before provider work, not authentication or a provider failure. Recovery uses the same SDK conversation.' : report.lesson === 'request-transformation' ? 'The sanitized transformation trace is captured inside the actual provider callback after request mapping.' : ''} There is no narration.\n\n${cues.map(([, , text]) => text).join('\n\n')}\n\n${['message-history', 'save-text-conversations'].includes(report.lesson) ? `The source is real OpenAI plain text through the Hashbrown SDK. No browser tools or generated UI are registered. The fixed application plan stays unchanged. Application text copies omit SDK IDs and do not restore checkpoints. Restored text gets fresh SDK message IDs. ${report.lesson === 'save-text-conversations' ? 'Only a subsequent successful generation enables saving again. Saved Lighthouse and Harbor are independent origin-local browser documents, separate from SDK identity. This demonstration uses a hard page reload; only events from the current page appear in replay. Explicit storage actions and replay make no provider requests. These documents are unencrypted; do not store secrets.' : 'Keep completed text creates an application memory copy. Clear messages and Restore kept text call the public SDK setter without new requests or browser storage writes. A new successful generation is required before keeping another copy. Replay is read-only.'}` : ['shared-state', 'activities', 'interrupts'].includes(report.lesson) ? 'The source is real OpenAI text through the Hashbrown SDK, wrapped by the checked local AG-UI agent. The agent authors state, activity and approval protocol events around unchanged provider text. There are no browser tools, generated UI schemas or executed plan steps. Shared SDK state is separate from the accepted application plan. Approval permits another explanation only; the bounded expiring process-local store does not provide production authentication or durable recovery. Replay is read-only. Interrupt footage resumes the complete original batch in the same user turn, then pauses on a fresh batch in the next turn.' : ['first-plan', 'conversation', 'system-instructions'].includes(report.lesson) ? `The source is OpenAI through the real Hashbrown SDK. No browser tools are registered and application state stays at revision 0. ${report.lesson === 'first-plan' ? 'The UI chat renders the exposed SummaryCard as a preview with no acceptance action.' : report.lesson === 'conversation' ? 'Plain text chat retains earlier messages, a stable conversation ID and a fresh run ID for each turn. Local history is not durable storage.' : 'The browser garden declaration is replaced by the fixed server application policy. Public policy evidence is captured from the actual OpenAI adapter mapping callback on both turns. Instructions do not authorize application actions.'}` : report.lesson === 'ui-selection' ? 'The source is TypeSafe through the real Hashbrown UI decision SDK. The application owns the plan, candidate components and props. The model chooses a known ID. Use view is explicit; low confidence and failures preserve state and offer manual choice. The recording finishes with an explicit manual steps choice at revision 2, without lowering the model-confidence threshold.' : report.lesson === 'decisions' ? 'The source is TypeSafe through the real Hashbrown decision SDK. The application supplies the fixed plan; the model selects only record, review or clarify. Confidence below 0.75, errors and cancellation preserve state and show manual review guidance. Use suggestion is an explicit application action.' : `The source is OpenAI through the real Hashbrown SDK${report.lesson === 'predictions' ? '. This completion registers no browser tools' : ', including the browser readContext tool'}. ${report.lesson === 'magic-text' ? 'The text-chat API streams plain Markdown into the real SDK Magic Text renderer. The supplied source is a reference, not proof of retrieval or correctness. The plan remains unchanged.' : report.lesson === 'predictions' ? 'The structured-completion API receives an explicit current-context snapshot. Only fresh completed validated proposals can be accepted; dismissal does not apply an action. The model does not execute code or invent catalogue IDs.' : ['structured-output', 'streaming', 'schemas'].includes(report.lesson) ? 'The structured-chat API returns plain typed data; the application renders the card.' : 'The UI-chat API renders the exposed SummaryCard from resolved props.'} ${['magic-text', 'predictions'].includes(report.lesson) ? '' : 'Accept plan is an explicit application action.'}`} ${report.lesson === 'save-text-conversations' ? 'Refresh clears local SDK sessions and captures but preserves explicitly saved browser text.' : 'Refresh clears local sessions.'}\n`,
  );
  if (
    ['agent-decisions', 'json-parser', 'natural-forms'].includes(report.lesson)
  ) {
    writeFileSync(
      `${base}-transcript.txt`,
      `${report.framework.toUpperCase()} · ${report.lesson}\n\nThis is a real provider recording of the checked canonical workbench. ${report.lesson === 'agent-decisions' ? `Real TypeSafe decisions arrive whole and select fixed read-only application handlers. Handler text is application output, not streamed model prose. Confidence is not correctness or authorization. Actual confidence scores: ${report.agentConfidences?.join(', ')}. Scores below 0.75 use the clarification handler.` : 'Real OpenAI JSON arrives through actual Hashbrown text chat and direct framework parser APIs. No local timer invents model tokens. Source completion, parser completion and original-document validation are independent.'} Unchanged protocol events are paced at 20 ms for filming. Footage is slowed to half speed; no narration.\n\n${cues.map(([, , text]) => text).join('\n\n')}\n\n${report.lesson === 'natural-forms' ? 'Review copies a fresh successful valid draft into editable application fields. Edits do not apply state. Explicit Apply revalidates the fields, source identity, turn and application revision, and can run once per generation. The real readContext browser tool returns the applied plan and revision to the next request.' : 'Application state remains at revision zero.'} Replay makes no requests or writes. Refresh clears these local sessions and captures.\n`,
    );
  }
  if (['ui-kits', 'ui-chatbot'].includes(report.lesson)) {
    if (report.fallbackObserved !== true)
      throw new Error('Missing actual framework fallback evidence');
    writeFileSync(
      `${base}-transcript.txt`,
      `${report.framework.toUpperCase()} · ${report.lesson}\n\nReal OpenAI output through actual Hashbrown UI chat, kit APIs and trusted framework renderers. The actual normalized kit registry and serialized schema are captured. A real configured framework fallback was observed. Only explicit acceptance of a current completed valid proposal changes application state. ${report.lesson === 'ui-chatbot' ? 'PlanReading is a read-only model report.' : 'SummaryCard and StepsCard are the only trusted components in this kit.'} The server requires a fresh successful context result before UI generation, then disables further tool calls. Unchanged protocol events are paced at 20 ms for filming. Footage is slowed to half speed; no narration.\n\n${cues.map(([, , text]) => text).join('\n\n')}\n\nThe real readContext tool returns the accepted application plan and revision to the next request. Original JSON, parsed props, current source/turn/revision and once-only guards protect acceptance. Replay makes no requests or writes. Refresh clears local sessions and captures.\n`,
    );
  }
  if (['server-threads', 'public-endpoint'].includes(report.lesson)) {
    writeFileSync(
      `${base}-transcript.txt`,
      `${report.framework.toUpperCase()} · ${report.lesson}\n\nReal OpenAI text through the actual Hashbrown SDK. Unchanged provider events are paced at 20 ms for filming. Footage is slowed to half speed; no narration. The loopback demo session and process-memory repository are application integrations, not production authentication or durable agent checkpoints.\n\n${cues.map(([, , text]) => text).join('\n\n')}\n\nServer saves are explicit completed-text snapshots with owner and version checks. No tools, generated UI, shared state or paused checkpoints are restored. The competing client makes a real independent HTTP write; a stale save returns 409. Anonymous and foreign-owner checks stop before provider invocation. Refresh clears SDK sessions and captures; loading server text starts no generation. Replay makes no requests or writes.\n`,
    );
  }
  if (report.lesson === 'javascript-runtime') {
    writeFileSync(
      `${base}-transcript.txt`,
      `${report.framework.toUpperCase()} · JavaScript runtime\n\nReal QuickJS execution through actual Hashbrown framework runtime APIs. Application-owned scripts, actual readPlan host calls and result/error wrappers. No model or provider request; no simulated JSON streaming. Each run creates a fresh context. Footage is slowed to half speed for readability; no narration.\n\n${cues.map(([, , text]) => text).join('\n\n')}\n\nThe host validates arguments explicitly. Estimates do not modify the plan. The execution deadline interrupts loops but does not roll back host effects or impose a memory limit. Replay executes no scripts, host calls, requests or writes. Refresh clears local captures.\n`,
    );
  }
  if (report.lesson === 'local-models') {
    writeFileSync(
      `${base}-transcript.txt`,
      `${report.framework.toUpperCase()} · Local models\n\nActual native Chrome inference through the real Hashbrown framework structured-chat APIs and experimental_chrome transport. The existing dedicated test profile uses requested v4 browser configuration; this does not identify the loaded model or establish default-device availability. Model already available; no new model download. Actual-speed footage with reading pauses; no narration or hosted model request. Native stream EOF leads to SDK terminal events; original JSON validation and application acceptance are separate.\n\n${cues.map(([, , text]) => text).join('\n\n')}\n\nEach native turn receives explicit application context. Only fresh successful valid proposals can be accepted. Replay opens no sessions, makes no prompts or requests, and writes no application state. Separate labelled API fixtures test unsupported states, cancellation, malformed output and recovery; they are not inference footage.\n`,
    );
  }
  if (report.lesson === 'generative-ui') {
    const overview = `canonical-workbench-${report.framework}`;
    for (const suffix of workbenchMediaSuffixes)
      copyFileSync(base + suffix, resolve(staging, overview + suffix));
    publishIds.push(overview);
  }
  console.log(
    `${id}: ${duration.toFixed(2)}s; ${report.source} source verified and staged`,
  );
}

publishWorkbenchMedia(staging, resolve('www/public/video/docs'), publishIds);
console.log(`Published ${publishIds.length} checked recordings.`);
