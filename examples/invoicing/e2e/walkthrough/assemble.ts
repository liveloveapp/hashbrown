import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { concatList, retime, type Timeline } from './timeline';

const FPS = 30;
/** Longest a model's stream may play on screen, in seconds. */
const STREAM_MAX = 3;

const ffmpeg = (args: readonly string[]) =>
  execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', ...args],
    { stdio: 'inherit' },
  );

/** Media duration in seconds, from ffprobe. */
export const duration = (file: string): number =>
  Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      file,
    ])
      .toString()
      .trim(),
  );

const INTERMEDIATE = [
  '-c:v',
  'libx264',
  '-crf',
  '12',
  '-preset',
  'veryfast',
  '-pix_fmt',
  'yuv420p',
];

/** A captured frame directory as a constant-rate 1920x1080 clip. */
function clip(timeline: Timeline, frames: string, work: string, name: string) {
  const list = join(work, `${name}.ffconcat`);
  writeFileSync(list, concatList(timeline, frames));
  const out = join(work, `${name}.mp4`);
  ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-vf',
    `scale=1920:1080:flags=lanczos,setsar=1,fps=${FPS}`,
    ...INTERMEDIATE,
    out,
  ]);
  return out;
}

/** The app clip re-timed by its markers, with the chip over fast spans. */
function retimed(
  timeline: Timeline,
  source: string,
  chip: string,
  work: string,
) {
  const { segments, fast, length } = retime(timeline, {
    streamMax: STREAM_MAX,
  });
  const parts = segments.map(
    (s, i) =>
      `[0:v]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},` +
      `setpts=(PTS-STARTPTS)/${s.speed}` +
      // Blend frames while fast-forwarding so motion reads as blur, not jitter.
      `${s.speed >= 3 ? ',tmix=frames=3' : ''},fps=${FPS}[p${i}]`,
  );
  const shown =
    fast
      .filter(([a, b]) => b - a > 0.4)
      .map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`)
      .join('+') || '0';
  const out = join(work, 'app.mp4');
  ffmpeg([
    '-i',
    source,
    '-loop',
    '1',
    '-i',
    chip,
    '-filter_complex',
    [
      ...parts,
      `${segments.map((_, i) => `[p${i}]`).join('')}concat=n=${segments.length}:v=1:a=0[cat]`,
      `[1:v]format=rgba[chip]`,
      `[cat][chip]overlay=x=W-w-560:y=28:enable='${shown}'[v]`,
    ].join(';'),
    '-map',
    '[v]',
    '-t',
    length.toFixed(3),
    ...INTERMEDIATE,
    out,
  ]);
  return out;
}

/**
 * Join title card, re-timed app and end card with crossfades into a web
 * friendly H.264 MP4 (1080p30, faststart). `dir` holds the captures:
 * `title/`, `app/`, `end/` and `chip.png`. Returns where the app clip starts
 * in the output, in seconds.
 */
export function assemble(
  dir: string,
  timelines: {
    readonly title: Timeline;
    readonly app: Timeline;
    readonly end: Timeline;
  },
  out: string,
): { readonly appOffset: number } {
  const work = join(dir, 'build');
  mkdirSync(work, { recursive: true });
  const title = clip(timelines.title, join(dir, 'title'), work, 'title');
  const end = clip(timelines.end, join(dir, 'end'), work, 'end');
  const app = retimed(
    timelines.app,
    clip(timelines.app, join(dir, 'app'), work, 'app-raw'),
    join(dir, 'chip.png'),
    work,
  );
  const tTitle = duration(title);
  const tApp = duration(app);
  const intro = 0.5;
  const outro = 0.6;
  ffmpeg([
    '-i',
    title,
    '-i',
    app,
    '-i',
    end,
    '-filter_complex',
    [
      `[0:v][1:v]xfade=transition=smoothup:duration=${intro}:offset=${(tTitle - intro).toFixed(3)}[a]`,
      `[a][2:v]xfade=transition=fade:duration=${outro}:offset=${(tTitle + tApp - intro - outro).toFixed(3)},format=yuv420p[v]`,
    ].join(';'),
    '-map',
    '[v]',
    '-r',
    String(FPS),
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '22',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    out,
  ]);
  return { appOffset: tTitle - intro };
}

/** Grab one frame at `seconds` as a PNG, for the poster. */
export function frameAt(video: string, seconds: number, out: string): void {
  ffmpeg(['-ss', seconds.toFixed(3), '-i', video, '-frames:v', '1', out]);
}
