/// <reference types="vite/client" />
import type { StackblitzConfig } from './tools/stackblitz-plugin';

declare module '*/stackblitz.yml' {
  const value: StackblitzConfig;
  export default value;
}

declare module 'virtual:home-code-html' {
  export const HOME_CODE_HTML: {
    hero: Record<'react' | 'angular', string>;
    steps: Record<'react' | 'angular', string[]>;
  };
}
