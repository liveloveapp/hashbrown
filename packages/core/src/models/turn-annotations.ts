import type { Turn } from './group-turns';
import type {
  AnyMessage,
  Attribution,
  ServerToolCallSource,
} from './view.models';

/**
 * An original provider attribution and the assistant answer that owns it.
 *
 * @public
 */
export type TurnAttribution = {
  readonly assistantMessageId: string;
  readonly attribution: Readonly<Attribution>;
};

/**
 * Collects sources in assistant order, with each assistant's own sources before
 * its server calls. Sources are unique by ID; the first original object wins.
 * Input objects are preserved and exposed through readonly types.
 *
 * @param turn - The turn whose sources to collect.
 * @returns Original sources in first-occurrence order.
 * @public
 */
export function collectTurnSources<M extends AnyMessage>(
  turn: Turn<M>,
): readonly Readonly<ServerToolCallSource>[] {
  const sources = turn.assistants.flatMap((assistant) => [
    ...(assistant.sources ?? []),
    ...(assistant.serverToolCalls ?? []).flatMap((call) => call.sources ?? []),
  ]);

  return Array.from(
    sources
      .reduce((byId, source) => {
        if (!byId.has(source.id)) byId.set(source.id, source);
        return byId;
      }, new Map<string, Readonly<ServerToolCallSource>>())
      .values(),
  );
}

/**
 * Collects every attribution in assistant order with its owning answer ID.
 * Original objects, provider HTML, and widget tokens are preserved verbatim;
 * attributions are neither deduplicated nor sanitized or interpreted.
 *
 * @param turn - The turn whose attributions to collect.
 * @returns Attribution owner records in input order.
 * @public
 */
export function collectTurnAttributions<M extends AnyMessage>(
  turn: Turn<M>,
): readonly TurnAttribution[] {
  return turn.assistants.flatMap((assistant) =>
    (assistant.attribution ?? []).map((attribution) => ({
      assistantMessageId: assistant.id,
      attribution,
    })),
  );
}
