import type { Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseWorkbenchCapture,
  withWorkbenchCaptureMilestones,
  type WorkbenchCapture,
} from '../../examples/quickstart/runtime/workbench-capture';

/** The largest published capture, in bytes. */
const captureLimit = 2_000_000;

/** The framework and lesson a capture is published for. */
export interface WorkbenchCaptureTarget {
  readonly framework: string;
  readonly lesson: string;
}

/**
 * Throws when a capture cannot be published: it belongs to another lesson,
 * ended in error, or exceeds the size limit.
 *
 * @param capture - The capture to check, stamped or not.
 * @param expected - The framework and lesson it is published for, if known.
 */
export function assertPublishableCapture(
  capture: WorkbenchCapture,
  expected?: WorkbenchCaptureTarget,
): void {
  const recorded = `${capture.framework}/${capture.lesson}`;
  const name = expected ? `${expected.framework}/${expected.lesson}` : recorded;
  if (name !== recorded)
    throw new Error(`Capture for ${name} was recorded as ${recorded}`);
  if (capture.events.at(-1)?.status === 'error')
    throw new Error(`Capture for ${name} ended in error`);
  const bytes = Buffer.byteLength(JSON.stringify(capture));
  if (bytes > captureLimit)
    throw new Error(
      `Capture for ${name} is ${bytes} bytes; the limit is ${captureLimit}`,
    );
}

/**
 * Saves the mounted workbench's capture, before its page closes, as JSON.
 * Throws instead of writing when the capture could not be published, so the
 * failing lesson stops its verifier before the rest of the batch is spent.
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
  assertPublishableCapture(capture);
  writeFileSync(path, JSON.stringify(capture));
}

/**
 * Validates a recorded capture and stamps it with the publishing commit and
 * the milestones docs moments resolve against.
 *
 * @param raw - The capture JSON a verifier saved.
 * @param commit - The commit the media is published from.
 * @param expected - The framework and lesson it is published for, if known.
 * @returns The JSON to publish beside the video.
 */
export function publishWorkbenchCapture(
  raw: string,
  commit: string,
  expected?: WorkbenchCaptureTarget,
): string {
  const capture = parseWorkbenchCapture(JSON.parse(raw));
  if (!capture) throw new Error('Capture is not a valid workbench capture');
  const stamped = { ...withWorkbenchCaptureMilestones(capture), commit };
  assertPublishableCapture(stamped, expected);
  return JSON.stringify(stamped);
}

/**
 * Reads and stamps every report's capture before any media is encoded,
 * throwing once with every missing or unpublishable capture.
 *
 * @param work - The recording directory holding `<framework>-<lesson>-live.capture.json`.
 * @param reports - The recorded lessons.
 * @param commit - The commit the media is published from.
 * @returns Stamped capture JSON keyed by `<framework>-<lesson>`.
 */
export function prepareWorkbenchCaptures(
  work: string,
  reports: readonly WorkbenchCaptureTarget[],
  commit: string,
): Map<string, string> {
  const prepared = new Map<string, string>();
  const errors: string[] = [];
  for (const report of reports) {
    const name = `${report.framework}/${report.lesson}`;
    const path = resolve(
      work,
      `${report.framework}-${report.lesson}-live.capture.json`,
    );
    if (!existsSync(path)) {
      errors.push(`Missing capture for ${name}`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      raw = null;
    }
    if (!parseWorkbenchCapture(raw)) {
      errors.push(`Capture for ${name} is not a valid workbench capture`);
      continue;
    }
    try {
      prepared.set(
        `${report.framework}-${report.lesson}`,
        publishWorkbenchCapture(JSON.stringify(raw), commit, report),
      );
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  if (errors.length)
    throw new Error(
      ['Unpublishable captures:', ...errors.map((error) => `- ${error}`)].join(
        '\n',
      ),
    );
  return prepared;
}

/** A published recording id and the lesson its capture was recorded for. */
export interface WorkbenchCaptureRecording extends WorkbenchCaptureTarget {
  readonly id: string;
}

/**
 * Validates and stamps every recording's capture, then writes each as the
 * `<id>-capture.json` media companion. Nothing is written unless all pass.
 *
 * @param work - The recording directory holding `<framework>-<lesson>-live.capture.json`.
 * @param staging - The media staging directory.
 * @param recordings - The published ids and the lessons they recorded.
 * @param commit - The commit the media is published from.
 */
export function stageWorkbenchCaptures(
  work: string,
  staging: string,
  recordings: readonly WorkbenchCaptureRecording[],
  commit: string,
): void {
  const captures = prepareWorkbenchCaptures(work, recordings, commit);
  for (const recording of recordings)
    writeFileSync(
      resolve(staging, `${recording.id}-capture.json`),
      captures.get(`${recording.framework}-${recording.lesson}`) ?? '',
    );
}
