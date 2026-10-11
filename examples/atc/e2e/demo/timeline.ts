/** One screencast frame and the wall-clock time Chrome stamped on it, in seconds. */
export interface Frame {
  readonly file: string;
  readonly t: number;
}

/** A named span of the recording, in wall-clock seconds. */
export interface Scene {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

/** Everything one capture produced. */
export interface Timeline {
  readonly frames: readonly Frame[];
  readonly scenes: readonly Scene[];
}

/** The span from the first scene's start to the last scene's end. */
export function sceneSpan(scenes: readonly Scene[]): {
  readonly start: number;
  readonly end: number;
} {
  if (scenes.length === 0) {
    throw new Error('the recording has no scenes');
  }

  return {
    start: Math.min(...scenes.map((scene) => scene.start)),
    end: Math.max(...scenes.map((scene) => scene.end)),
  };
}

/**
 * An ffconcat list that turns a screencast into real-time video over
 * `[start, end]`. Chrome only sends a frame when the page changes, so each
 * frame plays until the next one arrives. The frame showing at `start` is held
 * from `start`; frames after `end` are dropped. Frames play in timestamp
 * order, since Chrome can stamp one slightly early.
 */
export function concatList(
  frames: readonly Frame[],
  dir: string,
  span: { readonly start: number; readonly end: number },
): string {
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const first = sorted.findLastIndex((frame) => frame.t <= span.start);
  const kept = sorted
    .slice(Math.max(first, 0))
    .filter((frame) => frame.t < span.end);
  if (kept.length === 0) {
    throw new Error('no frames fall inside the recording');
  }
  const entries = kept.flatMap((frame, index) => {
    const from = Math.max(frame.t, span.start);
    const to = index + 1 < kept.length ? kept[index + 1].t : span.end;

    return [
      `file '${dir}/${frame.file}'`,
      `duration ${Math.max(to - from, 0.001).toFixed(4)}`,
    ];
  });
  // The concat demuxer only honours the last duration when a file follows it.
  const last = kept[kept.length - 1];

  return [
    'ffconcat version 1.0',
    ...entries,
    `file '${dir}/${last.file}'`,
    '',
  ].join('\n');
}

/** Where a scene starts in the trimmed video, in seconds. */
export function sceneOffset(scenes: readonly Scene[], name: string): number {
  const scene = scenes.find((candidate) => candidate.name === name);
  if (scene === undefined) {
    throw new Error(`no scene named ${name}`);
  }

  return scene.start - sceneSpan(scenes).start;
}
