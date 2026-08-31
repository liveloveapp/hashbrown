import { mkdirSync, rmSync } from 'node:fs';

/**
 * Replace the generated API reference directory with an empty directory.
 */
export function resetReferenceOutput(outputPath: string): void {
  rmSync(outputPath, { recursive: true, force: true });
  mkdirSync(outputPath, { recursive: true });
}
