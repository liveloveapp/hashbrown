import { s } from '@hashbrownai/core';
import { useTool } from '@hashbrownai/react';
import type { Chat } from '@hashbrownai/core';
import {
  AgingSummary,
  AssistantText,
  CustomerCard,
  LedgerTable,
  TrendChart,
} from './assistant-kit';

/**
 * A client-side twin of the server's `render` tool, registered for display
 * only. Hashbrown surfaces a tool call on an assistant message only when the
 * client has a tool of that name, and resolves its arguments as they stream
 * when the schema marks them streaming; this is what lets the panel paint
 * the answer while the model is still writing it. The server executes the
 * real `render` and its result marks the call done before hashbrown would
 * ever run a client handler, so the handler here is unreachable. B4 does not
 * interpret tools the client advertises, so the definition is inert on the
 * wire.
 */
const renderSchema = s.streaming.object('The answer to show the user', {
  text: s.streaming.string('Plain prose answer'),
  components: s.streaming.array(
    'Components to show under the prose',
    s.anyOf([
      s.object('A table of specific records', {
        LedgerTable: s.object('LedgerTable', {
          title: s.string('Table title'),
          recordIds: s.array('Record IDs', s.string('A record ID')),
        }),
      }),
      s.object('Monthly invoiced versus received', {
        TrendChart: s.object('TrendChart', {
          currency: s.string('ISO currency code'),
          customerId: s.anyOf([s.string('A customer ID'), s.nullish()]),
          months: s.integer('Months of history'),
        }),
      }),
      s.object('Outstanding balance by aging bucket', {
        AgingSummary: s.object('AgingSummary', {
          currency: s.string('ISO currency code'),
          customerId: s.anyOf([s.string('A customer ID'), s.nullish()]),
        }),
      }),
      s.object('One client', {
        CustomerCard: s.object('CustomerCard', {
          customerId: s.string('A customer ID'),
        }),
      }),
      s.object('Offer to review one unapplied payment', {
        ReviewPayment: s.object('ReviewPayment', {
          paymentId: s.string('A payment ID'),
        }),
      }),
    ]),
  ),
});

export type RenderArgs = s.Infer<typeof renderSchema>;
export type RenderTool = Chat.Tool<'render', RenderArgs, never>;

export function useRenderTool(): RenderTool {
  return useTool({
    name: 'render',
    description: 'Show the answer to the user.',
    schema: renderSchema,
    handler: async () => {
      throw new Error('render is executed by the server');
    },
    deps: [],
  });
}

/** The `render` call on a message, if any: the last one, since a rejected call is retried. */
export function findRenderCall(
  toolCalls: readonly Chat.AnyToolCall[],
): RenderArgs | undefined {
  const call = toolCalls.findLast((toolCall) => toolCall.name === 'render');
  const args = call?.args as Partial<RenderArgs> | null | undefined;
  return args && typeof args === 'object' ? (args as RenderArgs) : undefined;
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
