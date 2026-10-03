import styles from './WalkthroughVideo.module.css';
import { WALKTHROUGH_VIDEO_URL } from './walkthrough';

/**
 * The recorded walkthrough of the invoicing example, for the docs
 * `<www-walkthrough-video>` element. Silent, with captions burned in, and
 * hosted on Vercel Blob (see `walkthrough.ts`); it loads only when played.
 */
export function WalkthroughVideo() {
  return (
    <figure className={styles.walkthrough}>
      <video
        src={WALKTHROUGH_VIDEO_URL}
        poster="/image/landing-page/invoicing-walkthrough.webp"
        width={1920}
        height={1080}
        controls
        muted
        playsInline
        preload="none"
      />
      <figcaption>
        Walkthrough: streamed answers, model-chosen components, and one approval
        for a payment that covers two invoices.
      </figcaption>
    </figure>
  );
}
