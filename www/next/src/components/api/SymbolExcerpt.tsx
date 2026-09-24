import Link from 'next/link';
import { type CSSProperties, Fragment, type ReactNode } from 'react';
import type { Excerpt, HighlightedSegment } from './excerpt';
import type { ReferenceTarget, SymbolRenderContext } from './symbol-context';
import styles from './SymbolExcerpt.module.css';
import { SymbolPopover } from './SymbolPopover';

/** Props of {@link SymbolExcerpt}. */
export interface SymbolExcerptProps {
  excerpt: Excerpt | undefined;
  context: SymbolRenderContext;
  deprecated?: boolean;
  /** Link references to their pages; off where the excerpt sits inside a link. */
  linked?: boolean;
  className?: string;
}

/** Shiki's font-style bit flags as inline styles, like `codeToHtml` emits. */
function segmentStyle(segment: HighlightedSegment): CSSProperties {
  const flags = segment.fontStyle ?? 0;
  return {
    color: segment.color,
    fontStyle: flags & 1 ? 'italic' : undefined,
    fontWeight: flags & 2 ? 'bold' : undefined,
    textDecoration: flags & 4 ? 'underline' : undefined,
  };
}

function ReferenceLink({
  reference,
  target,
  children,
}: {
  reference: string;
  target: ReferenceTarget;
  children: ReactNode;
}) {
  const link = target.external ? (
    <a
      href={target.href}
      target="_blank"
      rel="noreferrer"
      className={styles.reference}
    >
      {children}
    </a>
  ) : (
    <Link href={target.href} className={styles.reference}>
      {children}
    </Link>
  );
  return target.popover ? (
    <SymbolPopover reference={reference} content={target.popover}>
      {link}
    </SymbolPopover>
  ) : (
    link
  );
}

/** Group consecutive segments of the same linked reference. */
function groupLine(
  segments: HighlightedSegment[],
  context: SymbolRenderContext,
  linked: boolean,
) {
  return segments.reduce<
    {
      target?: ReferenceTarget;
      reference?: string;
      segments: HighlightedSegment[];
    }[]
  >((groups, segment) => {
    const target =
      linked && segment.reference
        ? context.linkTarget(segment.reference)
        : undefined;
    const last = groups[groups.length - 1];
    if (target && last?.target && last.reference === segment.reference) {
      return [
        ...groups.slice(0, -1),
        { ...last, segments: [...last.segments, segment] },
      ];
    }
    return [
      ...groups,
      {
        target,
        reference: target ? segment.reference : undefined,
        segments: [segment],
      },
    ];
  }, []);
}

/**
 * A highlighted TypeScript excerpt whose references link to their API pages,
 * with hover popovers for Hashbrown symbols. Port of `SymbolExcerpt`, with the
 * reference overlay the Angular version left commented out.
 */
export function SymbolExcerpt({
  excerpt,
  context,
  deprecated = false,
  linked = true,
  className,
}: SymbolExcerptProps) {
  const code = excerpt?.code ? context.highlight(excerpt) : undefined;
  return (
    <div className={[styles.excerpt, className].filter(Boolean).join(' ')}>
      {code ? (
        <div className={deprecated ? styles.deprecated : undefined}>
          <pre
            className="shiki hashbrown"
            style={{ backgroundColor: code.bg, color: code.fg }}
            tabIndex={0}
          >
            <code>
              {code.lines.map((line, lineIndex) => (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 ? '\n' : null}
                  <span className="line">
                    {groupLine(line, context, linked).map((group, index) => {
                      const spans = group.segments.map((segment, i) => (
                        <span key={i} style={segmentStyle(segment)}>
                          {segment.text}
                        </span>
                      ));
                      return group.target && group.reference ? (
                        <ReferenceLink
                          key={index}
                          reference={group.reference}
                          target={group.target}
                        >
                          {spans}
                        </ReferenceLink>
                      ) : (
                        <span key={index}>{spans}</span>
                      );
                    })}
                  </span>
                </Fragment>
              ))}
            </code>
          </pre>
        </div>
      ) : null}
    </div>
  );
}
