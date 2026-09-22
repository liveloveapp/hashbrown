import type { Chat } from '@hashbrownai/core';
import {
  AgingSummary,
  AssistantText,
  CustomerCard,
  LedgerTable,
  TrendChart,
} from './assistant-kit';

/**
 * The server's `render` arguments as far as they have streamed. Hashbrown
 * resolves a server-executed call's JSON progressively, so any field may be
 * absent or partial until the call completes.
 */
export interface RenderArgs {
  readonly text?: string;
  readonly components?: readonly Record<string, Record<string, unknown>>[];
}

/**
 * The `render` call on a message, if any: the last one, since a rejected call
 * is retried. Its arguments are read-only display data; the server executes
 * the call and validates the tree before the answer is committed.
 */
export function findRenderCall(
  serverToolCalls: readonly Chat.ServerToolCall[] | undefined,
): RenderArgs | undefined {
  const call = serverToolCalls?.findLast((c) => c.name === 'render');
  const args = call?.args;
  return args && typeof args === 'object' && !Array.isArray(args)
    ? (args as RenderArgs)
    : undefined;
}

/**
 * The answer drawn from the render call's arguments as they stream, through
 * the same kit components the validated answer uses, so the hand-over is
 * invisible. `ReviewPayment` is an action and waits for the server's
 * validation. IDs the streaming parser has not completed are simply absent.
 */
export function RenderDraft({ args }: { args: RenderArgs }) {
  const text = typeof args.text === 'string' ? args.text : '';
  const components = Array.isArray(args.components) ? args.components : [];
  return (
    <AssistantText text={text}>
      {components.map((leaf, index) => {
        if (!leaf || typeof leaf !== 'object') return null;
        if ('LedgerTable' in leaf && leaf.LedgerTable) {
          const { title, recordIds } = leaf.LedgerTable;
          if (typeof title !== 'string' || !Array.isArray(recordIds))
            return null;
          return (
            <LedgerTable key={index} title={title} recordIds={recordIds} />
          );
        }
        if ('TrendChart' in leaf && leaf.TrendChart) {
          const { currency, customerId, months } = leaf.TrendChart;
          if (typeof currency !== 'string' || typeof months !== 'number')
            return null;
          return (
            <TrendChart
              key={index}
              currency={currency}
              customerId={typeof customerId === 'string' ? customerId : null}
              months={months}
            />
          );
        }
        if ('AgingSummary' in leaf && leaf.AgingSummary) {
          const { currency, customerId } = leaf.AgingSummary;
          if (typeof currency !== 'string') return null;
          return (
            <AgingSummary
              key={index}
              currency={currency}
              customerId={typeof customerId === 'string' ? customerId : null}
            />
          );
        }
        if ('CustomerCard' in leaf && leaf.CustomerCard) {
          const { customerId } = leaf.CustomerCard;
          if (typeof customerId !== 'string') return null;
          return <CustomerCard key={index} customerId={customerId} />;
        }
        return null;
      })}
    </AssistantText>
  );
}
