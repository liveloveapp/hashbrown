import { type ComponentProps } from 'react';

interface RotateClockwiseProps extends ComponentProps<'svg'> {
  size?: number | string;
}

function RotateClockwise({
  size = 24,
  className,
  ...props
}: RotateClockwiseProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon icon-tabler icons-tabler-outline icon-tabler-rotate-clockwise ${className || ''}`.trim()}
      {...props}
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5" />
    </svg>
  );
}

RotateClockwise.displayName = 'RotateClockwise';

export default RotateClockwise;
