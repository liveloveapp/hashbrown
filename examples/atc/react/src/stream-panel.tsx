import type { StreamBlock } from '@atc/shared';

/**
 * A dark JSON panel for "Show the stream": one titled block per layer. The
 * text is untrusted model output, so it is only ever rendered as text.
 * `className` places the panel (for example on the map).
 */
export function StreamPanel({
  blocks,
  className = '',
  label = 'Stream',
}: {
  blocks: readonly StreamBlock[];
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`atc-stream ${className}`.trim()}
      role="group"
      aria-label={label}
      data-testid="stream-panel"
    >
      {blocks.map((block, index) => (
        <section key={index} className="atc-stream-block">
          <p className="atc-stream-title">{block.title}</p>
          <pre className="atc-stream-text" tabIndex={0}>
            {block.text}
          </pre>
        </section>
      ))}
    </div>
  );
}
