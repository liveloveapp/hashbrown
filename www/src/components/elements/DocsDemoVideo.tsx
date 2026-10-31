import { useId } from 'react';
import { DOCS_DEMOS, type DocsDemoId } from './docs-demo-media';
import styles from './DocsDemoVideo.module.css';

/**
 * An on-demand recorded demo for an `hb-docs-demo` Markdown element.
 *
 * The `demo` prop selects a stable identifier from the media catalog. With
 * `deferPoster`, the poster URL is kept in `data-poster` for a client parent to
 * apply: browsers fetch a video poster even when it is hidden.
 */
export function DocsDemoVideo({
  demo,
  deferPoster = false,
}: {
  demo: DocsDemoId;
  deferPoster?: boolean;
}) {
  if (!Object.hasOwn(DOCS_DEMOS, demo)) {
    throw new Error(`Unknown documentation demo: ${demo}`);
  }
  const captionId = useId();
  const media = DOCS_DEMOS[demo];
  const { width, height } = media.dimensions;
  const base = `/video/docs/${demo}`;

  return (
    <figure className={styles.demo}>
      <video
        aria-label={media.title}
        aria-describedby={captionId}
        poster={deferPoster ? undefined : `${base}-poster.png`}
        data-poster={deferPoster ? `${base}-poster.png` : undefined}
        width={width}
        height={height}
        style={{ aspectRatio: `${width} / ${height}` }}
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
        <p id={captionId}>{media.caption}</p>
        <p className={styles.note}>
          {media.recording}{' '}
          <a
            href={`${base}-transcript.txt`}
            aria-label={`Read the text walkthrough: ${media.title}`}
          >
            Read the text walkthrough
          </a>
          .
        </p>
      </figcaption>
    </figure>
  );
}
