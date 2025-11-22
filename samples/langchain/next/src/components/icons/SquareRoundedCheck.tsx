import { type ComponentProps } from 'react';

interface SquareRoundedCheckProps extends ComponentProps<'svg'> {
  size?: number | string;
}

function SquareRoundedCheck({
  size = 24,
  className,
  ...props
}: SquareRoundedCheckProps) {
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
      className={`icon icon-tabler icons-tabler-outline icon-tabler-square-rounded-check ${className || ''}`.trim()}
      {...props}
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M9 12l2 2l4 -4" />
      <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9z" />
    </svg>
  );
}

SquareRoundedCheck.displayName = 'SquareRoundedCheck';

export default SquareRoundedCheck;
