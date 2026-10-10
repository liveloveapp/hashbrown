const WIDTH = 250;
const HEIGHT = 80;

/**
 * Stroke geometry for the ATC lettermark. Render each path with
 * `fill="none"`, `stroke="currentColor"`, round caps and round joins. Size it
 * with `width / height` so the mark keeps its aspect ratio.
 */
export const ATC_MARK = {
  width: WIDTH,
  height: HEIGHT,
  viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
  strokeWidth: 10,
  paths: [
    'M8 72 L40 8 L72 72',
    'M92 8 H148 M120 8 V72',
    'M232 20 A32 32 0 1 0 232 60',
  ],
} as const;
