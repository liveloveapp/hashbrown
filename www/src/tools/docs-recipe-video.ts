import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RecipeMode, RecipePhase } from './docs-recipe-browser';

const descriptions: Record<RecipeMode, string> = {
  'magic-text':
    'Generate a Markdown packing reply. The real Magic Text renderer displays a heading, emphasis and a list as text streams. After the source definition arrives, select the citation to open source details. A citation is a reference, not proof that the reply is correct.',
  'predictive-suggestions':
    'Request city packing suggestions. Accept Passport into the separate packing list, then dismiss Phone charger. These local edits start no new request. Request hiking suggestions explicitly and accept Water bottle. Suggestions never apply automatically.',
  'ui-selection':
    'Request a quick overview. The decision chooses the application-owned summary card. Ask for each product and its quantity. The decision chooses the application-owned item list. The application supplies Apples, Bread and all quantities; the model chooses only a candidate ID.',
};

/** Crops an already captured full viewport image into a measured result screenshot. */
export function cropRecipeScreenshot(
  frame: string,
  target: string,
  bounds: { width: number; height: number; x: number; y: number },
): { width: number; height: number } {
  const dimensions = {
    width: Math.ceil(bounds.width / 2) * 2,
    height: Math.ceil(bounds.height / 2) * 2,
  };
  const crop = [
    dimensions.width,
    dimensions.height,
    Math.floor(bounds.x),
    Math.floor(bounds.y),
  ].join(':');
  execFileSync('ffmpeg', ['-y', '-i', frame, '-vf', `crop=${crop}`, target], {
    stdio: 'ignore',
  });
  return dimensions;
}

/** Produces a final-result preview, full interaction, brief hold and accessible companions. */
export function encodeRecipeVideo(
  mode: string,
  raw: string,
  work: string,
  assets: string,
  phases: readonly RecipePhase[],
  description = descriptions[mode as RecipeMode],
  disclosure?: string,
): { duration: number } {
  const master = resolve(work, `${mode}-master.mp4`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loop',
      '1',
      '-t',
      '2',
      '-i',
      resolve(work, `${mode}-frame.png`),
      '-i',
      raw,
      '-filter_complex',
      '[0:v]fps=30,setpts=PTS-STARTPTS,setsar=1[a];[1:v]fps=30,setpts=PTS-STARTPTS,setsar=1,tpad=stop_mode=clone:stop_duration=1.5[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]',
      '-map',
      '[v]',
      '-an',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      master,
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      master,
      '-c:v',
      'libx264',
      '-crf',
      '23',
      '-preset',
      'slow',
      '-movflags',
      '+faststart',
      resolve(assets, `${mode}.mp4`),
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      master,
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '32',
      '-b:v',
      '0',
      '-cpu-used',
      '4',
      '-row-mt',
      '1',
      resolve(assets, `${mode}.webm`),
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      master,
      '-frames:v',
      '1',
      resolve(assets, `${mode}-poster.png`),
    ],
    { stdio: 'ignore' },
  );
  const duration = Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        master,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  if (!Number.isFinite(duration) || duration <= 4)
    throw new Error('Invalid recording duration');
  const stamp = (seconds: number) =>
    new Date(seconds * 1000).toISOString().slice(11, 23);
  const cues = [
    { seconds: 0, text: 'Preview of the completed interaction.' },
    { seconds: 2, text: 'The complete interaction follows.' },
    ...phases.map((phase) => ({ ...phase, seconds: phase.seconds + 2 })),
  ];
  const vtt = cues
    .map((cue, index) => {
      const end = Math.min(cues[index + 1]?.seconds ?? duration, duration);
      if (end <= cue.seconds) return '';
      return `${stamp(cue.seconds)} --> ${stamp(end)}\n${cue.text}\n`;
    })
    .filter(Boolean)
    .join('\n');
  writeFileSync(resolve(assets, `${mode}.vtt`), `WEBVTT\n\n${vtt}`);
  writeFileSync(
    resolve(work, `${mode}-phases.json`),
    JSON.stringify(phases, null, 2),
  );
  writeFileSync(
    resolve(assets, `${mode}-transcript.txt`),
    createRecipeTranscript(mode, description, disclosure),
  );
  return { duration };
}

/** Authors the accessible companion with the fixture boundary used by its recording. */
export function createRecipeTranscript(
  mode: string,
  description: string,
  disclosure = 'Scripted AG-UI or decision responses, presentation styles added, no live model and no narration. Application state is local and clears on refresh.',
): string {
  return `${mode}\n\nRecorded through the checked React component after both React and Angular passed the same browser checks. ${disclosure}\n\nThe first two seconds preview the final result. The complete interaction follows.\n\n${description}\n\nThe recording ends with a brief hold on the result. Error, cancellation, stale-response and recovery behavior are checked separately in both frameworks.\n`;
}
