import styles from './chips.module.css';

/**
 * The "Deprecated" badge; the reason shows on hover. Port of `DeprecatedChip`
 * (the Material tooltip becomes a native `title`).
 */
export function DeprecatedChip({ reason }: { reason: string }) {
  return (
    <span className={styles.deprecated} title={reason}>
      Deprecated
    </span>
  );
}
