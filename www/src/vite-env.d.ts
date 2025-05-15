/// <reference types="vite/client" />
import type { StackblitzConfig } from './tools/stackblitz-plugin';

declare module '*/stackblitz.yml' {
  const value: StackblitzConfig;
  export default value;
}
