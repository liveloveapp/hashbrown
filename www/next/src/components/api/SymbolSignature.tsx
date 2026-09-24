import type { ApiMember } from '../../lib/api-reference';
import type { SymbolRenderContext } from './symbol-context';
import { paramsOf, returnsOf, typeParamsOf } from './symbol-model';
import { SymbolExcerpt } from './SymbolExcerpt';
import styles from './SymbolSignature.module.css';

interface MemberProps {
  symbol: ApiMember;
  context: SymbolRenderContext;
}

/** `@param`/`@optional` rows with types and descriptions. Port of `SymbolParams`. */
export function SymbolParams({ symbol, context }: MemberProps) {
  return (
    <div className={styles.params}>
      {paramsOf(symbol).map((param, index) => (
        <div key={index} className={styles.param}>
          <div className={styles.paramHeader}>
            <code className={styles.symbol}>
              {param.required ? '@param' : '@optional'}
            </code>
            <code>{param.name}:</code>
            <SymbolExcerpt excerpt={param.excerpt} context={context} />
          </div>
          {param.description ? (
            <p>{context.inlineMarkdown(param.description)}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** `@type` rows with each type parameter's constraint. Port of `SymbolTypeParams`. */
export function SymbolTypeParams({ symbol, context }: MemberProps) {
  return (
    <div className={styles.params}>
      {typeParamsOf(symbol).map((param, index) => (
        <div key={index} className={styles.typeParam}>
          <code className={styles.symbol}>@type</code>
          <code className={styles.name}>{param.name}</code>
          <SymbolExcerpt excerpt={param.excerpt} context={context} />
        </div>
      ))}
    </div>
  );
}

/** The `@returns` row. Port of `SymbolReturns`. */
export function SymbolReturns({ symbol, context }: MemberProps) {
  const returns = returnsOf(symbol);
  return (
    <div className={styles.returns}>
      {returns ? (
        <>
          <code className={styles.symbol}>@returns</code>
          <SymbolExcerpt excerpt={returns} context={context} />
        </>
      ) : null}
    </div>
  );
}

/** The bare return type shown in a panel header. Port of `SymbolReturn`. */
export function SymbolReturn({
  member,
  context,
}: {
  member: ApiMember;
  context: SymbolRenderContext;
}) {
  const returns = returnsOf(member);
  return (
    <div className={styles.return}>
      {returns ? <SymbolExcerpt excerpt={returns} context={context} /> : null}
    </div>
  );
}
