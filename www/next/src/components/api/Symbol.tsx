import type { ApiSymbol } from '../../lib/api-reference';
import styles from './Symbol.module.css';
import { SymbolApi } from './SymbolApi';
import { SymbolChip } from './SymbolChip';
import { SymbolCodeExample } from './SymbolCodeExample';
import type { SymbolRenderContext } from './symbol-context';
import { hasSignaturePanel } from './symbol-model';
import { SymbolExamples, SymbolSummary, SymbolUsageNotes } from './SymbolDocs';
import { SymbolHeader } from './SymbolHeader';
import { SymbolMethods } from './SymbolMethods';
import {
  SymbolParams,
  SymbolReturn,
  SymbolReturns,
  SymbolTypeParams,
} from './SymbolSignature';

/**
 * A symbol's API page body. Namespaces list their members as chips; other
 * symbols show the summary, then for each overload its API block, parameter
 * panel, member panels and examples. Port of `Symbol`.
 *
 * @param props.summary - The symbol to render.
 * @param props.context - From `buildSymbolContext` for the same symbol.
 */
export function Symbol({
  summary,
  context,
}: {
  summary: ApiSymbol;
  context: SymbolRenderContext;
}) {
  if (summary.kind === 'Namespace') {
    return (
      <div className={styles.host}>
        {summary.members.map((symbol, index) => [
          <SymbolHeader
            key={`header-${index}`}
            fileUrlPath={summary.fileUrlPath}
            symbol={symbol}
          />,
          <div key={`symbols-${index}`} className={styles.symbols}>
            {(symbol.members ?? []).map((child, childIndex) => (
              <SymbolChip key={childIndex} symbol={child} />
            ))}
          </div>,
        ])}
      </div>
    );
  }

  const [first] = summary.members;
  if (!first) {
    return <div className={styles.host} />;
  }
  return (
    <div className={styles.host}>
      <SymbolHeader fileUrlPath={summary.fileUrlPath} symbol={first} />
      <article className={styles.article}>
        {first.docs.summary ? (
          <SymbolSummary symbol={first} context={context} />
        ) : null}
        {summary.members.map((symbol, index) => (
          <div key={index} className={styles.overload}>
            <SymbolApi symbol={symbol} context={context} />
            {hasSignaturePanel(symbol) ? (
              <SymbolCodeExample
                header={symbol.name}
                actions={<SymbolReturn member={symbol} context={context} />}
              >
                <div className={styles.symbol}>
                  {symbol.parameters?.length ? (
                    <SymbolParams symbol={symbol} context={context} />
                  ) : null}
                  {symbol.typeParameters?.length ? (
                    <SymbolTypeParams symbol={symbol} context={context} />
                  ) : null}
                  {symbol.returnTypeTokenRange ? (
                    <SymbolReturns symbol={symbol} context={context} />
                  ) : null}
                  {symbol.docs.usageNotes ? (
                    <SymbolUsageNotes symbol={symbol} context={context} />
                  ) : null}
                </div>
              </SymbolCodeExample>
            ) : null}
            <SymbolMethods symbol={symbol} context={context} />
            <SymbolExamples symbol={symbol} context={context} />
          </div>
        ))}
      </article>
    </div>
  );
}
