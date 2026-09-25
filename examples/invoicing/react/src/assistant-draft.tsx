import type { ReactNode } from 'react';
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

/** A message's `render` call as the client sees it. */
export interface RenderCall {
  readonly args: RenderArgs;
  /**
   * `validated` once the server has run the call and accepted the tree, so
   * every ID resolved and actions may be offered; `failed` when the server
   * rejected it, in which case nothing is shown and the model retries or the
   * run ends in an error; `streaming` otherwise.
   */
  readonly state: 'streaming' | 'validated' | 'failed';
}

/** Whether a completed call's tool message reports success. */
function toolResultSucceeded(result: PromiseSettledResult<unknown>): boolean {
  if (result.status !== 'fulfilled') return false;
  const value = result.value;
  if (typeof value !== 'string') return true;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return true;
    const message =
      'kwargs' in parsed && parsed.kwargs && typeof parsed.kwargs === 'object'
        ? (parsed.kwargs as Record<string, unknown>)
        : (parsed as Record<string, unknown>);
    return message['status'] !== 'error';
  } catch {
    return true;
  }
}

/**
 * The `render` call on a message, if any: the last one, since a rejected call
 * is retried. Its arguments are what the browser renders; the server executes
 * the call and validates the tree, and its result says whether it did.
 */
export function findRenderCall(
  serverToolCalls: readonly Chat.ServerToolCall[] | undefined,
): RenderCall | undefined {
  const call = serverToolCalls?.findLast((c) => c.name === 'render');
  const args = call?.args;
  if (!call || !args || typeof args !== 'object' || Array.isArray(args))
    return undefined;
  const state =
    call.status !== 'complete' || !call.result
      ? 'streaming'
      : toolResultSucceeded(call.result)
        ? 'validated'
        : 'failed';
  return { args: args as RenderArgs, state };
}

/**
 * The answer drawn from the render call's arguments: progressively while they
 * stream, then as the final answer once the server has validated the call,
 * through the same kit components either way so nothing moves at hand-over.
 * `ReviewPayment` is an action and appears only once validated. IDs the
 * streaming parser has not completed are simply absent.
 */
export function RenderDraft({
  args,
  validated = false,
  ReviewPayment,
}: {
  args: RenderArgs;
  /** Offer actions such as `ReviewPayment`; only once the server validated the tree. */
  validated?: boolean;
  /** The workspace's review action, which owns the review flow. */
  ReviewPayment?: (props: {
    paymentId: string;
    invoiceId?: string | null;
  }) => ReactNode;
}) {
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
        if (
          validated &&
          ReviewPayment &&
          'ReviewPayment' in leaf &&
          leaf.ReviewPayment
        ) {
          const { paymentId, invoiceId } = leaf.ReviewPayment;
          if (typeof paymentId !== 'string') return null;
          return (
            <ReviewPayment
              key={index}
              paymentId={paymentId}
              invoiceId={typeof invoiceId === 'string' ? invoiceId : null}
            />
          );
        }
        return null;
      })}
    </AssistantText>
  );
}
