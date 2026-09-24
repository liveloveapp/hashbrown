import type { MouseEvent } from 'react';
import styles from './chips.module.css';

/** Props of {@link KindChip}. */
export interface KindChipProps {
  kind: string;
  selected: boolean;
  onChange: (kind: string) => void;
}

/** A toggleable kind filter on the API index. Port of `KindChip`. */
export function KindChip({ kind, selected, onChange }: KindChipProps) {
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    onChange(kind);
  };
  return (
    // An anchor without href, as in Angular; role and key handling make it a button.
    <a
      className={`underline ${styles.chip} ${styles.kindChip} ${selected ? styles.selected : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onChange(kind);
        }
      }}
    >
      <span className={`kind ${kind} ${styles.initial}`}>
        {kind.charAt(0).toUpperCase()}
      </span>
      {` ${kind}`}
    </a>
  );
}
