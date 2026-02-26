'use client';

import { memo } from 'react';
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
  // Kept for API compatibility with existing call sites.
  void unit;
  void fragmentDuration;

  return (
    <span className={styles.container} data-raw-text={text ?? ''}>
      <span className={styles.fragmentText}>{text ?? ''}</span>
    </span>
  );
}

MagicTextRenderer.displayName = 'MagicTextRenderer';

export default memo(MagicTextRenderer);
