import { execFileSync } from 'node:child_process';

/** The output frame rate. */
export const FPS = 30;

/** Runs ffmpeg quietly, throwing on failure. */
export function ffmpeg(args: readonly string[]): void {
  execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', ...args],
    {
      stdio: 'inherit',
    },
  );
}

/** A media file's duration in seconds, from ffprobe. */
export function duration(file: string): number {
  return Number(
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
}

/**
 * Arguments that turn an ffconcat list of screencast frames into a
 * near-lossless constant-rate master at `width` x `height`. Frames are
 * captured at 2x and scaled down with Lanczos, so text stays crisp.
 */
export function masterArgs(
  list: string,
  out: string,
  size: { readonly width: number; readonly height: number },
): string[] {
  return [
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-vf',
    `scale=${size.width}:${size.height}:flags=lanczos,setsar=1,fps=${FPS}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '10',
    '-pix_fmt',
    'yuv420p',
    out,
  ];
}

/** Arguments for the web H.264 MP4: no audio, fast start. */
export function mp4Args(input: string, out: string): string[] {
  return [
    '-i',
    input,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-maxrate',
    '4000k',
    '-bufsize',
    '8000k',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    out,
  ];
}

/** Arguments for the web VP9 WebM: no audio, constrained quality. */
export function webmArgs(input: string, out: string): string[] {
  return [
    '-i',
    input,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '2000k',
    '-crf',
    '30',
    '-maxrate',
    '3000k',
    '-bufsize',
    '6000k',
    '-row-mt',
    '1',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    '-pix_fmt',
    'yuv420p',
    out,
  ];
}

/** Arguments that grab the frame at `seconds` as a PNG. */
export function frameArgs(
  input: string,
  seconds: number,
  out: string,
): string[] {
  return ['-ss', seconds.toFixed(3), '-i', input, '-frames:v', '1', out];
}

/**
 * Arguments that make a seamless loop of `input` (`length` seconds long): the
 * clip from `fade` to its end, whose last `fade` seconds crossfade into the
 * clip's first `fade` seconds. The result is `length - fade` long and its
 * last frame leads straight into its first.
 */
export function loopArgs(
  input: string,
  length: number,
  fade: number,
  out: string,
): string[] {
  if (length <= fade * 3) {
    throw new RangeError(
      `a ${length} s clip is too short for a ${fade} s fade`,
    );
  }
  const body = (length - fade).toFixed(3);

  return [
    '-i',
    input,
    '-filter_complex',
    [
      `[0:v]split[a][b]`,
      `[a]trim=start=${fade.toFixed(3)},setpts=PTS-STARTPTS[main]`,
      `[b]trim=end=${fade.toFixed(3)},setpts=PTS-STARTPTS[head]`,
      `[main][head]xfade=transition=fade:duration=${fade.toFixed(3)}:offset=${(length - 2 * fade).toFixed(3)},fps=${FPS}[v]`,
    ].join(';'),
    '-map',
    '[v]',
    '-t',
    body,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '10',
    '-pix_fmt',
    'yuv420p',
    out,
  ];
}
