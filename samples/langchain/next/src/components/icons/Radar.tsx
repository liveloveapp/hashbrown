import { type ComponentProps } from 'react';

interface RadarProps extends ComponentProps<'svg'> {
  size?: number | string;
}

function Radar({ size = 24, className, ...props }: RadarProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 -20 320 220"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      {...props}
    >
      <g>
        <circle
          cx="160"
          cy="90"
          r="40"
          fill="none"
          stroke="var(--sky-blue-dark)"
          strokeWidth="1"
        />
        <circle
          cx="160"
          cy="90"
          r="75"
          fill="none"
          stroke="var(--sky-blue-dark)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <circle
          cx="160"
          cy="90"
          r="110"
          fill="none"
          stroke="var(--sky-blue-dark)"
          strokeWidth="1"
          opacity="0.6"
        />
        <g className="radar-arm">
          <line
            x1="160"
            y1="90"
            x2="160"
            y2="-20"
            stroke="var(--sky-blue-dark)"
            strokeWidth="1.5"
            opacity="0.8"
          />
          <path
            d="M160,90 L160,-20 A110,110 0 0,0 50,90 Z"
            fill="var(--sky-blue)"
            opacity="0.16"
          />
        </g>
      </g>
    </svg>
  );
}

Radar.displayName = 'Radar';

export default Radar;
