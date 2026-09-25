/** One screencast frame and the capture time Chrome stamped on it, in seconds. */
export interface Frame {
  readonly file: string;
  readonly t: number;
}

/**
 * A point where playback speed changes. Each marker's speed holds until the
 * next marker; the last marker ends the recording.
 */
export interface Marker {
  readonly t: number;
  readonly speed: number;
  readonly label: string;
}

/** Everything a capture produced: frames in capture order plus speed markers. */
export interface Timeline {
  readonly frames: readonly Frame[];
  readonly markers: readonly Marker[];
}

/** A span of source time, in seconds from the start, and its playback speed. */
export interface Segment {
  readonly start: number;
  readonly end: number;
  readonly speed: number;
}

const startOf = (timeline: Timeline) =>
  Math.min(timeline.frames[0].t, timeline.markers[0].t);
const endOf = (timeline: Timeline) =>
  timeline.markers[timeline.markers.length - 1].t;

/**
 * An ffconcat list that plays each frame until the next one arrives, so a
 * screencast (which only emits frames on change) becomes real-time video.
 * The first frame is held from the first marker, keeping marker times and
 * clip times on one clock; frames after the last marker are dropped.
 */
export function concatList(timeline: Timeline, dir: string): string {
  const t0 = startOf(timeline);
  const tEnd = endOf(timeline);
  const kept = [...timeline.frames]
    .filter((frame) => frame.t <= tEnd)
    .sort((a, b) => a.t - b.t);
  const entries = kept.flatMap((frame, index) => {
    const from = index === 0 ? t0 : frame.t;
    const to = index + 1 < kept.length ? kept[index + 1].t : tEnd;
    return [
      `file '${dir}/${frame.file}'`,
      `duration ${Math.max(to - from, 0.001).toFixed(4)}`,
    ];
  });
  // ffconcat ignores the last duration unless the last file repeats.
  const last = kept[kept.length - 1];
  return [
    'ffconcat version 1.0',
    ...entries,
    `file '${dir}/${last.file}'`,
  ].join('\n');
}

/**
 * Re-time a capture by its markers. Streaming plays near real time but never
 * takes more than `streamMax` seconds of screen time, however long the model
 * streamed. Spans played at 3x or faster are reported, in output time and
 * merged when adjacent, so the video can label them as fast-forwarded.
 */
export function retime(
  timeline: Timeline,
  { streamMax }: { readonly streamMax: number },
): {
  readonly segments: readonly Segment[];
  readonly fast: readonly (readonly [number, number])[];
  readonly length: number;
} {
  const t0 = startOf(timeline);
  const { markers } = timeline;
  const segments = markers
    .slice(0, -1)
    .map((marker, index) => {
      const start = marker.t - t0;
      const end = markers[index + 1].t - t0;
      const speed =
        marker.label === 'streaming'
          ? Math.max(marker.speed, (end - start) / streamMax)
          : marker.speed;
      return { start, end, speed };
    })
    .filter((segment) => segment.end - segment.start > 0.05);
  let at = 0;
  const fast: [number, number][] = [];
  for (const segment of segments) {
    const length = (segment.end - segment.start) / segment.speed;
    if (segment.speed >= 3) {
      const previous = fast[fast.length - 1];
      if (previous && Math.abs(previous[1] - at) < 1e-9)
        previous[1] = at + length;
      else fast.push([at, at + length]);
    }
    at += length;
  }
  return { segments, fast, length: at };
}
