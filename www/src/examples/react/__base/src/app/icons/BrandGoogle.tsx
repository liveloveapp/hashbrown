import type { SVGProps } from 'react';

/**
 * Source: https://tablericons.com/icon/brand-google
 */
export default function BrandGoogle({
  width = '24px',
  height = '24px',
  ...props
}: SVGProps<SVGSVGElement> & {
  width?: string;
  height?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      style={{ width, height }}
      {...props}
    >
      <path d="M20.945 11a9 9 0 1 1 -3.284 -5.997l-2.655 2.392a5.5 5.5 0 1 0 2.119 6.605h-4.125v-3h7.945z" />
    </svg>
  );
}
