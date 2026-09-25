import type { ApiSymbol } from '../../lib/api-reference';
import { SymbolApi } from './SymbolApi';
import type { SymbolRenderContext } from './symbol-context';
import { SymbolSummary } from './SymbolDocs';
import { SymbolHeader } from './SymbolHeader';

/**
 * The body of a symbol popover: header, summary and a compact API block for
 * the symbol's first member. Port of `SymbolPopover`'s template; the hover
 * behavior lives in the `SymbolPopover` client component.
 *
 * @param props.context - Built with `links: false`, so popovers don't nest.
 */
export function SymbolPopoverContent({
  summary,
  context,
}: {
  summary: ApiSymbol;
  context: SymbolRenderContext;
}) {
  const [symbol] = summary.members;
  return (
    <>
      <SymbolHeader fileUrlPath={summary.fileUrlPath} symbol={symbol} />
      <SymbolSummary symbol={symbol} context={context} />
      <SymbolApi symbol={symbol} context={context} density="-1" />
    </>
  );
}
