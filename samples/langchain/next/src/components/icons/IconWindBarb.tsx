import * as React from 'react';

export interface WindBarbIconProps
  extends Omit<React.ComponentPropsWithoutRef<'svg'>, 'stroke'> {
  speedKnots: number;
  directionDegrees: number;
  size?: number | string;
  stroke?: number;
  color?: string;
  calmThreshold?: number;
}

export const IconWindBarb = React.forwardRef<SVGSVGElement, WindBarbIconProps>(
  (
    {
      speedKnots,
      directionDegrees,
      size = 24,
      stroke = 1,
      color = 'currentColor',
      calmThreshold = 2.5,
      className,
      ...rest
    },
    ref,
  ) => {
    const centerX = 12;
    const centerY = 12;
    const stemLength = 8;
    const barbSpacing = 2;
    const longBarbLength = 4;
    const shortBarbLength = 2.5;
    const flagLength = 4;

    const round = (value: number) => Math.round(value * 1000) / 1000;

    const normalizedDirection = ((directionDegrees % 360) + 360) % 360;
    const angleRad = ((normalizedDirection - 90) * Math.PI) / 180;
    const vx = Math.cos(angleRad);
    const vy = Math.sin(angleRad);

    const stemX2 = round(centerX + vx * stemLength);
    const stemY2 = round(centerY + vy * stemLength);

    const units = Math.round(speedKnots / 5);
    const isCalm = units === 0 || speedKnots < calmThreshold;

    type Segment = 'flag' | 'long' | 'short';
    const segments: Segment[] = [];

    if (!isCalm) {
      let remaining = units;
      while (remaining >= 10) {
        segments.push('flag');
        remaining -= 10;
      }
      while (remaining >= 2) {
        segments.push('long');
        remaining -= 2;
      }
      if (remaining === 1) {
        segments.push('short');
      }
    }

    const elements: React.ReactNode[] = [];

    if (isCalm) {
      elements.push(
        <circle
          key="calm"
          cx={centerX}
          cy={centerY}
          r={3}
          data-testid="wind-barb-calm"
        />,
      );
    } else {
      elements.push(
        <line
          key="stem"
          x1={centerX}
          y1={centerY}
          x2={stemX2}
          y2={stemY2}
          data-testid="wind-barb-stem"
        />,
      );

      const perpX = -vy;
      const perpY = vx;
      const initialOffset = 1.5;

      segments.forEach((segment, index) => {
        const offset = initialOffset + index * barbSpacing;
        const baseX = round(stemX2 - vx * offset);
        const baseY = round(stemY2 - vy * offset);

        if (segment === 'flag') {
          const apexX = round(baseX + perpX * flagLength);
          const apexY = round(baseY + perpY * flagLength);
          const tipX = round(baseX - vx * flagLength);
          const tipY = round(baseY - vy * flagLength);

          elements.push(
            <polygon
              key={`flag-${index}`}
              points={`${baseX},${baseY} ${apexX},${apexY} ${tipX},${tipY}`}
              data-testid="wind-barb-flag"
            />,
          );
        } else {
          const length = segment === 'long' ? longBarbLength : shortBarbLength;
          const endX = round(baseX + perpX * length);
          const endY = round(baseY + perpY * length);

          elements.push(
            <line
              key={`${segment}-${index}`}
              x1={baseX}
              y1={baseY}
              x2={endX}
              y2={endY}
              data-testid={
                segment === 'long' ? 'wind-barb-long' : 'wind-barb-short'
              }
            />,
          );
        }
      });
    }

    const sizeValue = typeof size === 'number' ? `${size}` : size;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={sizeValue}
        height={sizeValue}
        viewBox="0 0 24 24"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className={['icon', 'icon-tabler', 'icon-tabler-wind-barb', className]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        {elements}
      </svg>
    );
  },
);

IconWindBarb.displayName = 'IconWindBarb';
