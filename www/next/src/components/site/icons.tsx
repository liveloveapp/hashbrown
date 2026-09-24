import type { CSSProperties, SVGProps } from 'react';

/**
 * Props for the site chrome icons. `height` and `width` are CSS lengths,
 * matching the Angular icon components' inputs (default `24px`).
 */
export type SiteIconProps = Omit<SVGProps<SVGSVGElement>, 'height' | 'width'> & {
  height?: string;
  width?: string;
};

const stroked = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const size = (
  { height = '24px', width = '24px' }: SiteIconProps,
  style?: CSSProperties,
): CSSProperties => ({ height, width, flexShrink: 0, ...style });

/** Tabler "command" icon. */
export const CommandIcon = ({ height, width, style, ...p }: SiteIconProps) => (
  <svg {...stroked} stroke="currentColor" style={size({ height, width }, style)} {...p}>
    <path d="M7 9a2 2 0 1 1 2 -2v10a2 2 0 1 1 -2 -2h10a2 2 0 1 1 -2 2v-10a2 2 0 1 1 2 2h-10" />
  </svg>
);

/** Tabler "menu" icon. */
export const MenuIcon = ({ height, width, style, ...p }: SiteIconProps) => (
  <svg {...stroked} stroke="#000000" style={size({ height, width }, style)} {...p}>
    <path d="M4 8l16 0" />
    <path d="M4 16l16 0" />
  </svg>
);

/** Tabler "x" icon. */
export const CloseIcon = ({ height, width, style, ...p }: SiteIconProps) => (
  <svg {...stroked} stroke="currentColor" style={size({ height, width }, style)} {...p}>
    <path d="M18 6l-12 12" />
    <path d="M6 6l12 12" />
  </svg>
);

/** Tabler "arrow-up-right" icon. */
export const ArrowUpRightIcon = ({ height, width, style, ...p }: SiteIconProps) => (
  <svg {...stroked} stroke="currentColor" style={size({ height, width }, style)} {...p}>
    <path d="M17 7l-10 10" />
    <path d="M8 7l9 0l0 9" />
  </svg>
);

/** Tabler "brand-github" icon. */
export const BrandGitHubIcon = ({ height, width, style, ...p }: SiteIconProps) => (
  <svg {...stroked} stroke="currentColor" style={size({ height, width }, style)} {...p}>
    <path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />
  </svg>
);

/** Tabler "brand-linkedin" icon. */
export const BrandLinkedInIcon = ({ height, width, style, ...p }: SiteIconProps) => (
  <svg {...stroked} stroke="currentColor" style={size({ height, width }, style)} {...p}>
    <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
    <path d="M8 11l0 5" />
    <path d="M8 8l0 .01" />
    <path d="M12 16l0 -5" />
    <path d="M16 16v-3a2 2 0 0 0 -4 0" />
  </svg>
);

/** Material "star shine" icon, used by the GitHub star button. */
export const StarShineIcon = ({ height, width, style, ...p }: SiteIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
    style={size({ height, width }, style)}
    {...p}
  >
    <path
      d="M21.3 18.7L18.3 15.7L19.7 14.3L22.7 17.3L21.3 18.7ZM17.7 6.7L16.3 5.3L19.3 2.3L20.7 3.7L17.7 6.7ZM6.30005 6.7L3.30005 3.7L4.70005 2.3L7.70005 5.3L6.30005 6.7ZM2.70005 18.7L1.30005 17.3L4.30005 14.3L5.70005 15.7L2.70005 18.7ZM8.85005 16.825L12 14.925L15.15 16.85L14.325 13.25L17.1 10.85L13.45 10.525L12 7.125L10.55 10.5L6.90005 10.825L9.67505 13.25L8.85005 16.825ZM5.82505 21L7.45005 13.975L2.00005 9.25L9.20005 8.625L12 2L14.8 8.625L22 9.25L16.55 13.975L18.175 21L12 17.275L5.82505 21Z"
      fill="currentColor"
    />
  </svg>
);

/** Tabler "file" icon, used by docs search results. */
export const FileIcon = ({ height, width, style, ...p }: SiteIconProps) => (
  <svg {...stroked} strokeWidth={1} stroke="#000000" style={size({ height, width }, style)} {...p}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
  </svg>
);

/** Tabler "file-code" icon, used by API search results. */
export const FileCodeIcon = ({ height, width, style, ...p }: SiteIconProps) => (
  <svg {...stroked} strokeWidth={1} stroke="currentColor" style={size({ height, width }, style)} {...p}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
    <path d="M10 13l-1 2l1 2" />
    <path d="M14 13l1 2l-1 2" />
  </svg>
);

/** Tabler "loader-2" icon: a three-quarter circle the search spins while loading. */
export const LoaderIcon = ({ height, width, style, ...p }: SiteIconProps) => (
  <svg {...stroked} strokeWidth={1} stroke="#000000" style={size({ height, width }, style)} {...p}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);
