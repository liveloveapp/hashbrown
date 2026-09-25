import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Frame, Marker, Timeline } from './timeline';

/** A running screencast: mark speed changes, then stop to write the timeline. */
export interface Capture {
  mark(speed: number, label: string): void;
  stop(): Promise<Timeline>;
}

/**
 * Screencast a page into `dir` as timestamped JPEG frames. Chrome emits a
 * frame only when the page changes, so the timeline, not a frame rate, is
 * what makes the result real time. On a Retina display a headed browser
 * captures physical pixels, which Chrome scales to at most 1920x1080.
 */
export async function capture(page: Page, dir: string): Promise<Capture> {
  await mkdir(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames: Frame[] = [];
  const writes: Promise<void>[] = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = `f${String(frames.length).padStart(6, '0')}.jpg`;
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
    void cdp
      .send('Page.screencastFrameAck', { sessionId })
      .catch(() => undefined);
    writes.push(writeFile(join(dir, file), Buffer.from(data, 'base64')));
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 94,
    maxWidth: 1920,
    maxHeight: 1080,
  });
  const markers: Marker[] = [];
  return {
    mark: (speed, label) =>
      markers.push({ t: Date.now() / 1000, speed, label }),
    async stop() {
      markers.push({ t: Date.now() / 1000, speed: 0, label: 'end' });
      await cdp.send('Page.stopScreencast');
      await new Promise((resolve) => setTimeout(resolve, 400));
      await Promise.all(writes);
      const timeline = { frames: [...frames], markers: [...markers] };
      await writeFile(join(dir, 'timeline.json'), JSON.stringify(timeline));
      return timeline;
    },
  };
}
