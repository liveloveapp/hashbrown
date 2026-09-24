import type { ApiMember } from '../../lib/api-reference';
import { DeprecatedChip } from './DeprecatedChip';
import { excerptFromTokens } from './excerpt';
import styles from './Symbol.module.css';
import type { SymbolRenderContext } from './symbol-context';
import { methodsOf, trimExcerptTokens } from './symbol-model';
import { SymbolCodeExample } from './SymbolCodeExample';
import { SymbolSummary, SymbolUsageNotes } from './SymbolDocs';
import { SymbolExcerpt } from './SymbolExcerpt';
import {
  SymbolParams,
  SymbolReturns,
  SymbolTypeParams,
} from './SymbolSignature';

/**
 * One panel per method or property signature, anchored by name so the API
 * block can link to it. Port of `SymbolMethods`.
 */
export function SymbolMethods({
  symbol,
  context,
}: {
  symbol: ApiMember;
  context: SymbolRenderContext;
}) {
  return (
    <div className={styles.methods}>
      {methodsOf(symbol).map((method, index) => (
        <SymbolCodeExample
          key={index}
          header={method.name}
          id={method.name}
          actions={
            <>
              <SymbolExcerpt
                excerpt={excerptFromTokens(
                  trimExcerptTokens(method.excerptTokens),
                )}
                context={context}
              />
              {method.docs.deprecated ? (
                <DeprecatedChip reason={method.docs.deprecated} />
              ) : null}
            </>
          }
        >
          <div className={`${styles.symbol} ${styles.methodSymbol}`}>
            <SymbolSummary symbol={method} context={context} />
            {method.parameters?.length ? (
              <SymbolParams symbol={method} context={context} />
            ) : null}
            {method.typeParameters?.length ? (
              <SymbolTypeParams symbol={method} context={context} />
            ) : null}
            {method.returnTypeTokenRange ? (
              <SymbolReturns symbol={method} context={context} />
            ) : null}
            {method.docs.usageNotes ? (
              <SymbolUsageNotes symbol={method} context={context} />
            ) : null}
          </div>
        </SymbolCodeExample>
      ))}
    </div>
  );
}
