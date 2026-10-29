import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Tabler "code" icon. */
export const CodeIcon = (p: IconProps) => (
  <svg {...base} stroke="currentColor" strokeWidth={2} height="24" width="24" {...p}>
    <path d="M7 8l-4 4l4 4" />
    <path d="M17 8l4 4l-4 4" />
    <path d="M14 4l-4 16" />
  </svg>
);

/** Tabler "components" icon. */
export const ComponentsIcon = (p: IconProps) => (
  <svg {...base} stroke="#000000" strokeWidth={1} height="24" width="24" {...p}>
    <path d="M3 12l3 3l3 -3l-3 -3z" />
    <path d="M15 12l3 3l3 -3l-3 -3z" />
    <path d="M9 6l3 3l3 -3l-3 -3z" />
    <path d="M9 18l3 3l3 -3l-3 -3z" />
  </svg>
);

/** Tabler "math-function" icon. */
export const FunctionsIcon = (p: IconProps) => (
  <svg {...base} stroke="#000000" strokeWidth={1} height="24" width="24" {...p}>
    <path d="M4 4m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h10.666a2.667 2.667 0 0 1 2.667 2.667v10.666a2.667 2.667 0 0 1 -2.667 2.667h-10.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
    <path d="M9 15.5v.25c0 .69 .56 1.25 1.25 1.25c.71 0 1.304 -.538 1.374 -1.244l.752 -7.512a1.381 1.381 0 0 1 1.374 -1.244c.69 0 1.25 .56 1.25 1.25v.25" />
    <path d="M9 12h6" />
  </svg>
);

/** Tabler "send" icon. */
export const SendIcon = (p: IconProps) => (
  <svg {...base} stroke="currentColor" strokeWidth={1} height="24" width="24" {...p}>
    <path d="M10 14l11 -11" />
    <path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" />
  </svg>
);

/** Tabler "chevron-down" icon. */
export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base} stroke="currentColor" strokeWidth={2} height="16" width="16" {...p}>
    <path d="M6 9l6 6l6 -6" />
  </svg>
);

/** Tabler "copy" icon. */
export const CopyIcon = (p: IconProps) => (
  <svg {...base} stroke="currentColor" strokeWidth={2} height="18" width="18" {...p}>
    <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
    <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
  </svg>
);

/** Tabler "database-cog" icon. */
export const DatabaseCogIcon = (p: IconProps) => (
  <svg {...base} stroke="#000000" strokeWidth={1} height="24" width="24" {...p}>
    <path d="M4 6c0 1.657 3.582 3 8 3s8 -1.343 8 -3s-3.582 -3 -8 -3s-8 1.343 -8 3" />
    <path d="M4 6v6c0 1.657 3.582 3 8 3c.21 0 .42 -.003 .626 -.01" />
    <path d="M20 11.5v-5.5" />
    <path d="M4 12v6c0 1.657 3.582 3 8 3" />
    <path d="M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M19.001 15.5v1.5" />
    <path d="M19.001 21v1.5" />
    <path d="M22.032 17.25l-1.299 .75" />
    <path d="M17.27 20l-1.3 .75" />
    <path d="M15.97 17.25l1.3 .75" />
    <path d="M20.733 20l1.3 .75" />
  </svg>
);

/** Tabler "message" icon. */
export const MessageIcon = (p: IconProps) => (
  <svg {...base} stroke="#000000" strokeWidth={1} height="24" width="24" {...p}>
    <path d="M8 9h8" />
    <path d="M8 13h6" />
    <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z" />
  </svg>
);

/** Tabler "bolt" icon. */
export const BoltIcon = (p: IconProps) => (
  <svg {...base} stroke="#000000" strokeWidth={1} height="24" width="24" {...p}>
    <path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" />
  </svg>
);
