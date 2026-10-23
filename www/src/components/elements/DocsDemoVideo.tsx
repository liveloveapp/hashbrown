import { DOCS_DEMOS, type DocsDemoId } from './docs-demo-media';
import styles from './DocsDemoVideo.module.css';

/**
 * An on-demand recorded demo for an `hb-docs-demo` Markdown element.
 *
 * The `demo` prop selects a stable identifier from the media catalog.
 */
export function DocsDemoVideo({ demo }: { demo: DocsDemoId }) {
  if (!Object.hasOwn(DOCS_DEMOS, demo)) {
    throw new Error(`Unknown documentation demo: ${demo}`);
  }
  const media = DOCS_DEMOS[demo];
  const base = `/video/docs/${demo}`;

  return (
    <figure className={styles.demo}>
      <video
        aria-label={media.title}
        poster={`${base}-poster.png`}
        width={1440}
        height={810}
        controls
        playsInline
        preload="none"
      >
        <source src={`${base}.webm`} type="video/webm" />
        <source src={`${base}.mp4`} type="video/mp4" />
        <track
          kind="captions"
          src={`${base}.vtt`}
          srcLang="en"
          label="English"
        />
        <a href={`${base}.mp4`}>Download the demo</a>
      </video>
      <figcaption>
        <p>{media.caption}</p>
        <p className={styles.note}>
          Recorded in the ATC example with scripted model responses and fixture
          traffic. No narration.{' '}
          <a href={`${base}-transcript.txt`}>Read the text walkthrough</a>.
        </p>
      </figcaption>
    </figure>
  );
}
