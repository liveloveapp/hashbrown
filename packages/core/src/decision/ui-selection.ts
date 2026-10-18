import { s } from '../schema';
import type { DecidableSchema } from './decidable-schema';
import type { ChoiceMeta, Result, Select, YesNoMeta } from './decision.types';
import { DecisionSchemaError } from './errors';

const MAX_CHOICE_OPTIONS = 255;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const MIN_PROBABILITY = 0.5;

/**
 * Builds the decidable schema for selecting among UI options.
 *
 * `'one'` produces a single enumeration (`pick`) carrying each option's
 * description; `{ max }` produces one boolean per option id.
 *
 * @param options - The selectable options.
 * @param select - How many options may be selected.
 * @returns A decidable object schema.
 * @throws DecisionSchemaError when the options or `select` are invalid.
 *
 * @public
 */
export function createSelectionSchema(
  options: ReadonlyArray<{ id: string; description: string }>,
  select: Select,
): DecidableSchema {
  if (options.length === 0) {
    throw new DecisionSchemaError('At least one option is required', '');
  }
  const seen = new Set<string>();
  for (const { id } of options) {
    if (id === '' || RESERVED_IDS.has(id)) {
      throw new DecisionSchemaError(
        `Option id "${id}" is empty or reserved`,
        id,
      );
    }
    if (id.includes('.')) {
      throw new DecisionSchemaError(
        `Option ids must not contain "." (found "${id}")`,
        id,
      );
    }
    if (seen.has(id)) {
      throw new DecisionSchemaError(`Duplicate option id "${id}"`, id);
    }
    seen.add(id);
  }
  if (select === 'one') {
    if (options.length > MAX_CHOICE_OPTIONS) {
      throw new DecisionSchemaError(
        `A choice may have at most ${MAX_CHOICE_OPTIONS} options, found ${options.length}`,
        'pick',
      );
    }
    const entries = Object.fromEntries(
      options.map(({ id, description }) => [id, description]),
    );
    return s.object('Selection', {
      pick: s.enumeration('Which one fits the input best', entries),
    });
  }
  if (!Number.isInteger(select.max) || select.max < 1) {
    throw new DecisionSchemaError(
      `max must be a positive integer (found ${select.max})`,
      '',
    );
  }
  const shape = Object.fromEntries(
    options.map(({ id, description }) => [
      id,
      s.boolean(`Does this option fit the input: ${description}`),
    ]),
  );
  return s.object('Selection', shape);
}

/**
 * Resolves a selection decision into chosen ids and a confidence flag.
 *
 * For `'one'`, the picked id is returned and `confident` compares the pick's
 * confidence to `minConfidence`. For `{ max }`, ids with probability of at
 * least 0.5 are kept, ordered by probability descending (ties keep the order
 * of `optionIds`) and capped at `max`; `confident` compares the best
 * probability to `minConfidence` and is false when nothing is kept.
 *
 * The option order is passed in rather than read from `result.meta` or the
 * schema, because both are records and JavaScript enumerates integer-like
 * keys first.
 *
 * @param result - The decoded decision result.
 * @param select - The selection mode used to build the schema.
 * @param optionIds - The option ids in the order given to
 * `createSelectionSchema`.
 * @param minConfidence - The minimum confidence to count as confident.
 * @returns The selected ids and whether the decision was confident.
 *
 * @public
 */
export function resolveSelection(
  result: Result<DecidableSchema>,
  select: Select,
  optionIds: readonly string[],
  minConfidence = 0,
): { ids: string[]; confident: boolean } {
  const value = result.value as Record<string, unknown>;
  const meta = result.meta as Record<string, unknown>;
  if (select === 'one') {
    const pick = value['pick'] as string;
    const pickMeta = meta['pick'] as ChoiceMeta;
    return { ids: [pick], confident: pickMeta.confidence >= minConfidence };
  }
  const kept = optionIds
    .filter((id) => Object.prototype.hasOwnProperty.call(meta, id))
    .map((id, index) => ({
      id,
      index,
      probability: (meta[id] as YesNoMeta).probability,
    }))
    .filter((entry) => entry.probability >= MIN_PROBABILITY)
    .sort((a, b) => b.probability - a.probability || a.index - b.index)
    .slice(0, select.max);
  return {
    ids: kept.map((entry) => entry.id),
    confident: kept.length > 0 && kept[0].probability >= minConfidence,
  };
}
