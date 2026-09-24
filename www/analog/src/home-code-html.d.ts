/** Homepage code samples highlighted at build time by `tools/home-code-plugin`. */
declare module 'virtual:home-code-html' {
  export const HOME_CODE_HTML: {
    hero: Record<'react' | 'angular', string>;
    steps: Record<'react' | 'angular', string[]>;
  };
}
