/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';
import type { DecidableSchema } from './decidable-schema';
import type { Question } from './decision.types';
import { DecisionSchemaError } from './errors';

const MAX_OPTIONS = 255;
const MIN_LEVELS = 2;
const MAX_LEVELS = 10;

/**
 * Options for `compileDecision`.
 *
 * @public
 */
export type CompileDecisionOptions = {
  /** `'declared'` (default) keeps schema order; `'shuffled'` randomizes option order. */
  optionOrder?: 'declared' | 'shuffled';
  /** Random source in [0, 1) used when shuffling. Defaults to `Math.random`. */
  random?: () => number;
};

function definitionOf(schema: unknown): any {
  return (schema as any)['~schema'].definition;
}

function joinPath(parent: string, key: string): string {
  return parent === '' ? key : `${parent}.${key}`;
}

function decimalPlaces(value: number): number {
  const text = String(value);
  if (text.includes('e-')) {
    const [mantissa, exponent] = text.split('e-');
    const fraction = mantissa.split('.')[1]?.length ?? 0;
    return fraction + Number(exponent);
  }
  return text.split('.')[1]?.length ?? 0;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function compileScore(
  schema: any,
  definition: any,
  path: string,
  isInteger: boolean,
): Question {
  const fail = (message: string) => new DecisionSchemaError(message, path);
  if (
    definition.exclusiveMinimum !== undefined ||
    definition.exclusiveMaximum !== undefined
  ) {
    throw fail('Score bounds must be inclusive (use minimum and maximum)');
  }
  const { minimum, maximum } = definition;
  if (typeof minimum !== 'number' || typeof maximum !== 'number') {
    throw fail('A score requires both minimum and maximum');
  }
  let step: number | undefined = definition.multipleOf;
  if (step === undefined) {
    if (!isInteger) {
      throw fail('A number score requires multipleOf');
    }
    step = 1;
  }
  if (!(step > 0) || !Number.isFinite(step) || maximum < minimum) {
    throw fail('A score requires a positive step and minimum <= maximum');
  }
  const offset = minimum / step;
  if (Math.abs(offset - Math.round(offset)) > 1e-9) {
    // Skillet checks multipleOf from 0, so an off-grid minimum would make
    // every level fail validation when the answer is decoded.
    throw fail(
      `A score minimum (${minimum}) must be a multiple of multipleOf (${step})`,
    );
  }
  const places = Math.max(decimalPlaces(step), decimalPlaces(minimum));
  const count = Math.floor((maximum - minimum) / step + 1e-9) + 1;
  if (count < MIN_LEVELS || count > MAX_LEVELS) {
    throw fail(
      `A score must have ${MIN_LEVELS} to ${MAX_LEVELS} levels, found ${count}`,
    );
  }
  const levels: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const value = Number((minimum + i * step).toFixed(places));
    levels[String(value)] = `${value} of ${minimum} to ${maximum}`;
  }
  return { type: 'score', instructions: s.getDescription(schema), levels };
}

function compileChoice(
  schema: any,
  definition: any,
  path: string,
  options: CompileDecisionOptions,
): Question {
  const entries: string[] = definition.entries;
  if (entries.length > MAX_OPTIONS) {
    throw new DecisionSchemaError(
      `A choice may have at most ${MAX_OPTIONS} options, found ${entries.length}`,
      path,
    );
  }
  const ordered =
    options.optionOrder === 'shuffled'
      ? shuffle(entries, options.random ?? Math.random)
      : entries;
  const descriptions: Readonly<Record<string, string>> | undefined =
    definition.entryDescriptions;
  const choices: Record<string, string | null> = {};
  for (const entry of ordered) {
    choices[entry] = descriptions?.[entry] ?? null;
  }
  return {
    type: 'choice',
    instructions: s.getDescription(schema),
    options: choices,
  };
}

function compileNode(
  schema: unknown,
  path: string,
  options: CompileDecisionOptions,
  into: Record<string, Question>,
): void {
  const node = schema as any;
  if (s.isObjectType(node)) {
    const shape: Record<string, unknown> = definitionOf(node).shape;
    for (const key of Object.keys(shape)) {
      if (key.includes('.')) {
        throw new DecisionSchemaError(
          `Property names must not contain "." (found "${key}")`,
          joinPath(path, key),
        );
      }
      compileNode(shape[key], joinPath(path, key), options, into);
    }
    return;
  }
  if (s.isEnumType(node)) {
    into[path] = compileChoice(node, definitionOf(node), path, options);
  } else if (s.isBooleanType(node)) {
    into[path] = { type: 'yesNo', instructions: s.getDescription(node) };
  } else if (s.isIntegerType(node)) {
    into[path] = compileScore(node, definitionOf(node), path, true);
  } else if (s.isNumberType(node)) {
    into[path] = compileScore(node, definitionOf(node), path, false);
  } else {
    throw new DecisionSchemaError('Schema type is not decidable', path);
  }
}

/**
 * Compiles a decidable schema into decision questions keyed by dotted
 * property path (for example `filter.altitude`).
 *
 * The root schema must be an `s.object`; otherwise a `DecisionSchemaError`
 * with path `''` is thrown. Enumerations become `choice` questions (at most
 * 255 options), booleans become `yesNo`, and bounded integers or numbers with
 * `multipleOf` become `score` questions of 2 to 10 levels. Exclusive bounds,
 * unbounded scores, a `minimum` that is not a multiple of `multipleOf`, and
 * property names containing `.` throw `DecisionSchemaError` carrying the
 * offending path.
 *
 * Score `levels` are keyed by the level value as a string. JavaScript
 * enumerates integer-like keys first, so the record's key order is not the
 * scale order for fractional or negative ranges: sort the keys numerically to
 * get the scale.
 *
 * @param schema - The decidable object schema.
 * @param options - Option ordering controls.
 * @returns Questions keyed by dotted id, in declared order.
 *
 * @public
 */
export function compileDecision(
  schema: DecidableSchema,
  options: CompileDecisionOptions = {},
): Record<string, Question> {
  if (!s.isObjectType(schema as any)) {
    throw new DecisionSchemaError(
      'The root decision schema must be an object',
      '',
    );
  }
  const questions: Record<string, Question> = {};
  compileNode(schema, '', options, questions);
  return questions;
}
