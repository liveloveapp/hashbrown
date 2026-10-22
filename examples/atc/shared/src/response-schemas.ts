import { createUiJsonSchema, markdownComponent } from '@hashbrownai/core';
import {
  aircraftCompareContract,
  airportCardContract,
  arrivalsBoardContract,
  flightCardContract,
} from './contracts';

/** The cards the model may render, in the order both apps expose them. */
const CARD_DEFINITIONS = [
  flightCardContract,
  arrivalsBoardContract,
  aircraftCompareContract,
  airportCardContract,
].map((contract) => ({ ...contract, children: false as const }));

/** The UI response schema for Markdown and some of the cards. */
function responseSchemaFor(
  cards: readonly (typeof CARD_DEFINITIONS)[number][],
) {
  return createUiJsonSchema({ components: [markdownComponent(), ...cards] });
}

/**
 * The UI the model may render when every card is available, built from the
 * same definitions, in the same order, as the components both apps expose.
 */
export const FULL_RESPONSE_SCHEMA: Record<string, unknown> =
  responseSchemaFor(CARD_DEFINITIONS);

/**
 * Every response schema an atc app may send: Markdown plus each of the 15
 * non-empty subsets of the four cards, in pinned order, the last being the
 * full schema. The apps narrow their cards with UI selection (at most two per
 * turn), and Hashbrown keeps the declared order of the components it keeps,
 * so a narrowed schema is a subset of the pinned order. The server keeps a
 * schema only when it equals one of these.
 */
export const RESPONSE_SCHEMA_ALLOWLIST: readonly Record<string, unknown>[] =
  Array.from({ length: 2 ** CARD_DEFINITIONS.length - 1 }, (_, index) =>
    CARD_DEFINITIONS.filter((_card, bit) => ((index + 1) >> bit) & 1),
  ).map((cards) =>
    cards.length === CARD_DEFINITIONS.length
      ? FULL_RESPONSE_SCHEMA
      : responseSchemaFor(cards),
  );
