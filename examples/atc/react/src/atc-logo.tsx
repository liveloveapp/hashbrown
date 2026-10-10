import { ATC_MARK } from '@atc/shared';

/** The ATC lettermark, drawn in the current text colour. */
export function AtcLogo({ height = 18 }: { height?: number }) {
  return (
    <svg
      role="img"
      aria-label="ATC"
      viewBox={ATC_MARK.viewBox}
      height={height}
      width={height * 3.125}
      fill="none"
      stroke="currentColor"
      strokeWidth={ATC_MARK.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ATC_MARK.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
