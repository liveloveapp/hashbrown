import type { ApiMember } from '../../lib/api-reference';
import styles from './SymbolDocs.module.css';
import type { SymbolRenderContext } from './symbol-context';

interface MemberProps {
  symbol: ApiMember;
  context: SymbolRenderContext;
}

/** A member's summary markdown. Port of `SymbolSummary`. */
export function SymbolSummary({ symbol, context }: MemberProps) {
  return (
    <div className={styles.summaryHost}>
      {symbol.docs.summary ? (
        <div className={styles.summary}>
          {context.markdown(symbol.docs.summary)}
        </div>
      ) : null}
    </div>
  );
}

/** The `@usageNotes` section. Port of `SymbolUsageNotes`. */
export function SymbolUsageNotes({ symbol, context }: MemberProps) {
  const notes = symbol.docs.usageNotes;
  return notes ? (
    <div className={styles.notes}>
      <h2 className={styles.notesTitle}>@usageNotes</h2>
      <div>{context.markdown(notes)}</div>
    </div>
  ) : null;
}

/** The "Examples" section. Port of `SymbolExamples`. */
export function SymbolExamples({ symbol, context }: MemberProps) {
  const examples = symbol.docs.examples;
  return (
    <div className={styles.examples}>
      {examples.length ? (
        <>
          <h2>Examples</h2>
          <div className={styles.content}>
            {examples.map((example, index) => (
              <div key={index} className={styles.example}>
                {context.markdown(example)}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
