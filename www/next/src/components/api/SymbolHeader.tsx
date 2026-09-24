import type { ApiMember } from '../../lib/api-reference';
import { CodeIcon } from '../icons';
import { DeprecatedChip } from './DeprecatedChip';
import styles from './SymbolHeader.module.css';
import { sourceUrl } from './symbol-model';

/** The source-code icon link to GitHub. Port of `SymbolCodeLink`. */
export function SymbolCodeLink({ fileUrlPath }: { fileUrlPath?: string }) {
  const url = sourceUrl(fileUrlPath);
  return (
    // Angular rendered href="" for paths outside dist/; omit it instead.
    <a
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
      aria-label="View source"
    >
      <CodeIcon />
    </a>
  );
}

/** A symbol's name, deprecation chip and source link. Port of `SymbolHeader`. */
export function SymbolHeader({
  fileUrlPath,
  symbol,
}: {
  fileUrlPath?: string;
  symbol: ApiMember;
}) {
  const deprecated = symbol.docs.deprecated;
  return (
    <div className={styles.host}>
      <header className={styles.header}>
        <h1 className={deprecated ? styles.deprecated : undefined}>
          {symbol.name}
        </h1>
        <div className={styles.meta}>
          {deprecated ? <DeprecatedChip reason={deprecated} /> : null}
          <SymbolCodeLink fileUrlPath={fileUrlPath} />
        </div>
      </header>
    </div>
  );
}
