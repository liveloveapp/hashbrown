/** A downloadable brand file. */
export interface BrandAsset {
  /** What it is, as shown on the brand page. */
  name: string;
  /** Where it's served from, relative to the site root. */
  href: string;
  /** Its format and size, e.g. `SVG` or `PNG · 1200×630`. */
  format: string;
  /** Where it should be used. */
  use: string;
  /** Draw its preview on ink rather than on ivory. */
  dark?: boolean;
  /** Pixel size, for raster files, so previews reserve their space. */
  width?: number;
  height?: number;
}

/** A named brand colour, backed by a token in `app/globals.css`. */
export interface BrandColor {
  name: string;
  /** The custom property, without its leading `--`. */
  token: string;
  hex: string;
  use: string;
}

/** The logo files, all in `public/image/logo`. */
export const BRAND_LOGOS: readonly BrandAsset[] = [
  {
    name: 'Wordmark',
    href: '/image/logo/word-mark.svg',
    format: 'SVG',
    use: 'The primary logo. Use it on white or ivory.',
  },
  {
    name: 'Wordmark, light',
    href: '/image/logo/word-mark-light.svg',
    format: 'SVG',
    use: 'For dark backgrounds, such as slides and code panels.',
    dark: true,
  },
  {
    name: 'Mascot',
    href: '/image/logo/brand-mark.svg',
    format: 'SVG',
    use: 'For avatars and favicons, where the wordmark is too small.',
  },
];

/** The share cards, each a prerendered route on the site. */
export const BRAND_CARDS: readonly BrandAsset[] = [
  {
    name: 'Open Graph card',
    href: '/opengraph-image',
    width: 1200,
    height: 630,
    format: 'PNG · 1200×630',
    use: 'Link previews on X, Slack, Discord and most other sites.',
  },
  {
    name: 'GitHub social preview',
    href: '/github-card',
    width: 1280,
    height: 640,
    format: 'PNG · 1280×640',
    use: 'The repository preview. Upload it in the repository settings.',
  },
  {
    name: 'Square card',
    href: '/square-card',
    width: 1080,
    height: 1080,
    format: 'PNG · 1080×1080',
    use: 'Square feeds such as LinkedIn and Instagram.',
  },
];

/** The palette: hashbrown's colours under LiveLoveApp's flat house style. */
export const BRAND_COLORS: readonly BrandColor[] = [
  {
    name: 'Chocolate brown',
    token: 'chocolate-brown',
    hex: '#774625',
    use: 'The accent: the wordmark, links and primary buttons.',
  },
  {
    name: 'Sunshine yellow',
    token: 'sunshine-yellow',
    hex: '#FBBB52',
    use: 'Highlights and active states.',
  },
  {
    name: 'Vanilla ivory',
    token: 'vanilla-ivory',
    hex: '#FAF9F0',
    use: 'Surfaces behind content.',
  },
  {
    name: 'Ink',
    token: 'gray-dark',
    hex: '#1C1917',
    use: 'Body text and code panels.',
  },
  {
    name: 'Sky blue',
    token: 'sky-blue',
    hex: '#9ECFD7',
    use: 'Secondary accents and the footer stripe.',
  },
  {
    name: 'Sunset orange',
    token: 'sunset-orange',
    hex: '#E88C4D',
    use: 'Secondary accents and the footer stripe.',
  },
  {
    name: 'Olive green',
    token: 'olive-green',
    hex: '#616F36',
    use: 'Success states and secondary accents.',
  },
  {
    name: 'Indian red',
    token: 'indian-red',
    hex: '#B86060',
    use: 'Errors and secondary accents.',
  },
];

/** The two typefaces, both loaded with `next/font`. */
export const BRAND_FONTS = [
  {
    name: 'Hanken Grotesk',
    href: 'https://fonts.google.com/specimen/Hanken+Grotesk',
    use: 'Headings and body text.',
    mono: false,
  },
  {
    name: 'JetBrains Mono',
    href: 'https://fonts.google.com/specimen/JetBrains+Mono',
    use: 'Code, commands and API names.',
    mono: true,
  },
] as const;
