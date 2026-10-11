import styles from './AtcDemoVideo.module.css';
import { ATC_DEMO_VIDEO } from './atc-media';

/**
 * The atc demo video for the `<www-atc-demo-video>` element: the code behind
 * each Hashbrown step, then the app doing it. Silent and hosted on Vercel Blob
 * (see `atc-media.ts`); it loads only when played.
 */
export function AtcDemoVideo() {
  const video = ATC_DEMO_VIDEO;

  return (
    <figure className={styles.demo}>
      <video
        poster={video.poster}
        width={video.width}
        height={video.height}
        controls
        muted
        playsInline
        preload="none"
      >
        <source src={video.webm} type="video/webm" />
        <source src={video.mp4} type="video/mp4" />
      </video>
      <figcaption>
        atc in 45 seconds: expose your components, give the model tools, render
        the stream.
      </figcaption>
    </figure>
  );
}
