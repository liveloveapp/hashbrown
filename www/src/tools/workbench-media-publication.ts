import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** The complete accessible companion set for one canonical recording. */
export const workbenchMediaSuffixes = [
  '.mp4',
  '.webm',
  '.vtt',
  '-poster.png',
  '-result.png',
  '-transcript.txt',
] as const;

/** Preflights every staged companion before replacing any published recording files. */
export function publishWorkbenchMedia(
  staging: string,
  target: string,
  ids: readonly string[],
): void {
  const files = ids.flatMap((id) =>
    workbenchMediaSuffixes.map((suffix) => id + suffix),
  );
  for (const file of files)
    if (!existsSync(resolve(staging, file)))
      throw new Error(`Missing staged media: ${file}`);
  for (const file of files)
    copyFileSync(resolve(staging, file), resolve(target, file));
}
