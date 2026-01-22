'use client';

import { type MagicTextFragment, prepareMagicText } from '@hashbrownai/core';
import { memo, useMemo } from 'react';
import styles from './MagicTextRenderer.module.css';

interface MagicTextRendererProps {
  text: string;
  unit?: 'run' | 'grapheme' | 'word';
  fragmentDuration?: number;
}

function MagicTextRenderer({
  text,
  unit = 'word',
  fragmentDuration = 220,
}: MagicTextRendererProps) {
  // unit currently unused but kept for API compatibility
  void unit;

  const prepared = useMemo(
    () => prepareMagicText(text ?? ''),
    [text],
  );

  const fragments = useMemo(() => prepared.fragments, [prepared.fragments]);

  const isStaticFragment = (fragment: MagicTextFragment): boolean =>
    fragment.state === 'provisional' ||
    (fragment.type === 'text' && fragment.text.trim().length === 0);

  const shouldShowWhitespace = (
    index: number,
    position: 'before' | 'after',
  ): boolean => {
    const fragment = fragments[index];
    if (!fragment) {
      return false;
    }
    if (position === 'before') {
      if (!fragment.whitespace.before) {
        return false;
      }
      const previous = fragments[index - 1];
      return !previous || previous.state === 'provisional';
    }
    if (!fragment.whitespace.after) {
      return false;
    }
    const next = fragments[index + 1];
    return !next || next.state === 'provisional';
  };

  return (
    <span className={styles.container} data-raw-text={text ?? ''}>
      {fragments.map((fragment, index) => {
        const animationDelay = isStaticFragment(fragment)
          ? 0
          : index * fragmentDuration;
        if (fragment.type === 'text') {
          return (
            <span
              key={fragment.key}
              className={`${styles.fragment} ${
                fragment.state === 'provisional'
                  ? styles.fragmentProvisional
                  : ''
              } ${isStaticFragment(fragment) ? styles.fragmentStatic : ''}`}
              style={{
                animationDelay: `${animationDelay}ms`,
              }}
            >
              {shouldShowWhitespace(index, 'before') && (
                <span
                  className={`${styles.fragmentSpace} ${styles.fragmentSpaceBefore}`}
                  aria-hidden="true"
                >
                  &nbsp;
                </span>
              )}
              {fragment.marks.link ? (
                <a
                  href={fragment.marks.link.href}
                  title={fragment.marks.link.title}
                  aria-label={fragment.marks.link.ariaLabel}
                  rel={fragment.marks.link.rel ?? 'noopener noreferrer'}
                  target={fragment.marks.link.target ?? '_blank'}
                  className={styles.link}
                >
                  {renderWrappers(fragment, 0)}
                </a>
              ) : (
                renderWrappers(fragment, 0)
              )}
              {shouldShowWhitespace(index, 'after') && (
                <span
                  className={`${styles.fragmentSpace} ${styles.fragmentSpaceAfter}`}
                  aria-hidden="true"
                >
                  &nbsp;
                </span>
              )}
            </span>
          );
        } else {
          // Citation fragment
          return (
            <span key={fragment.key}>
              {shouldShowWhitespace(index, 'before') && (
                <span
                  className={`${styles.fragmentSpace} ${styles.fragmentSpaceBefore}`}
                  aria-hidden="true"
                >
                  &nbsp;
                </span>
              )}
              <sup
                className={`${styles.fragment} ${styles.citation}`}
                role="doc-noteref"
                style={{
                  animationDelay: `${animationDelay}ms`,
                }}
              >
                <span className={styles.citationPlaceholder}>
                  <span className={styles.citationPlaceholderWrapper}>
                    <span
                      className={styles.citationPlaceholderIcon}
                      aria-hidden="true"
                    ></span>
                  </span>
                  <span className={styles.srOnly}>{fragment.text}</span>
                </span>
              </sup>
              {shouldShowWhitespace(index, 'after') && (
                <span
                  className={`${styles.fragmentSpace} ${styles.fragmentSpaceAfter}`}
                  aria-hidden="true"
                >
                  &nbsp;
                </span>
              )}
            </span>
          );
        }
      })}
    </span>
  );
}

function renderWrappers(
  fragment: MagicTextFragment & { type: 'text' },
  wrapperIndex: number,
): React.ReactNode {
  if (wrapperIndex < fragment.wrappers.length) {
    const Wrapper =
      fragment.wrappers[wrapperIndex] === 'strong' ? 'strong' : 'em';
    return <Wrapper>{renderWrappers(fragment, wrapperIndex + 1)}</Wrapper>;
  }
  return renderText(fragment);
}

function renderText(
  fragment: MagicTextFragment & { type: 'text' },
): React.ReactNode {
  if (fragment.marks.code) {
    return (
      <code className={`${styles.fragmentText} ${styles.fragmentTextCode}`}>
        {fragment.text}
      </code>
    );
  }
  return <span className={styles.fragmentText}>{fragment.text}</span>;
}

MagicTextRenderer.displayName = 'MagicTextRenderer';

export default memo(MagicTextRenderer);
