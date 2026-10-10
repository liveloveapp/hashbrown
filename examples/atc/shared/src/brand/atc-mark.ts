/**
 * Stroke geometry for the ATC lettermark. Render each path with
 * `fill="none"`, `stroke="currentColor"`, round caps and round joins.
 */
export const ATC_MARK = {
  viewBox: '0 0 250 80',
  strokeWidth: 10,
  paths: [
    'M8 72 L40 8 L72 72',
    'M92 8 H148 M120 8 V72',
    'M232 20 A32 32 0 1 0 232 60',
  ],
} as const;
