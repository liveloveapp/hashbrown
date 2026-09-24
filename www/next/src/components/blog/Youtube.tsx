import styles from './Youtube.module.css';

const VIDEO_ID_PATTERNS = [
  /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
  /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
  /youtube\.com\/live\/([a-zA-Z0-9_-]+)/,
  /youtu\.be\/([a-zA-Z0-9_-]+)/,
];

/**
 * Extract the video id from a YouTube embed, watch, live or `youtu.be` URL.
 *
 * @param src - A YouTube URL.
 * @returns The video id, or `undefined` when the URL isn't recognized.
 */
export function youtubeVideoId(src: string): string | undefined {
  for (const pattern of VIDEO_ID_PATTERNS) {
    const id = src.match(pattern)?.[1];
    if (id) {
      return id;
    }
  }
  return undefined;
}

/**
 * A responsive 16:9 YouTube embed. Ports the Angular `www-youtube`.
 *
 * @param props.src - Any YouTube URL `youtubeVideoId` understands.
 * @param props.title - The iframe's accessible title.
 * @param props.width - The iframe's width attribute.
 */
export function Youtube({
  src,
  title = 'YouTube Video',
  width = '100%',
}: {
  src: string;
  title?: string;
  width?: string;
}) {
  return (
    <div className={styles.host}>
      <iframe
        className={styles.iframe}
        src={`https://www.youtube.com/embed/${youtubeVideoId(src)}`}
        title={title}
        width={width}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        loading="lazy"
        // Next's bundled React treats `credentialless` as a boolean attribute
        // (renders `credentialless=""`); the iframe typings don't include it.
        {...{ credentialless: true }}
      />
    </div>
  );
}
