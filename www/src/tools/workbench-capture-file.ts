import type { Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  parseWorkbenchCapture,
  type WorkbenchCapture,
} from '../../examples/quickstart/runtime/workbench-capture';

/** The largest published capture, in bytes. */
const captureLimit = 2_000_000;

/**
 * Saves the mounted workbench's capture, before its page closes, as JSON.
 *
 * @param page - A page whose workbench is still mounted.
 * @param path - Where to write the unpublished capture.
 */
export async function saveWorkbenchCapture(
  page: Page,
  path: string,
): Promise<void> {
  const capture = await page.evaluate(
    (recordedAt) =>
      (
        globalThis as {
          hashbrownWorkbench?: {
            capture: (recordedAt: string) => WorkbenchCapture;
          };
        }
      ).hashbrownWorkbench?.capture(recordedAt) ?? null,
    new Date().toISOString(),
  );
  if (!capture) throw new Error('No mounted workbench to capture');
  writeFileSync(path, JSON.stringify(capture));
}

/**
 * Validates a recorded capture and stamps it with the publishing commit.
 *
 * @param raw - The capture JSON a verifier saved.
 * @param commit - The commit the media is published from.
 * @returns The JSON to publish beside the video.
 */
export function publishWorkbenchCapture(raw: string, commit: string): string {
  const capture = parseWorkbenchCapture(JSON.parse(raw));
  if (!capture) throw new Error('Capture is not a valid workbench capture');
  const name = `${capture.framework}/${capture.lesson}`;
  if (capture.events.at(-1)?.status === 'error')
    throw new Error(`Capture for ${name} ended in error`);
  const published = JSON.stringify({ ...capture, commit });
  const bytes = Buffer.byteLength(published);
  if (bytes > captureLimit)
    throw new Error(
      `Capture for ${name} is ${bytes} bytes; the limit is ${captureLimit}`,
    );
  return published;
}
