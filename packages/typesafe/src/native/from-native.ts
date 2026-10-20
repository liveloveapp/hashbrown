import { DecisionResponseError } from '@hashbrownai/core';
import type { Decision } from '@hashbrownai/core';
import { orderedLevelKeys } from './levels';
import type { NativeAnswer, NativeResponse } from './native.types';

type Tree = { [key: string]: Decision.JsonValue };

/**
 * Maps a TypeSafe `systemone` response to a Hashbrown decision response.
 *
 * Values are nested by dotted question id; metadata stays keyed by the dotted
 * id. A choice returns its option key, a `noul` answer is true at or above 0.5,
 * and a score returns its most probable level as a number (ties take the
 * lower level), the same way a choice returns its most probable option.
 * Native score answers are level indexes into the numerically ordered levels;
 * the weighted score in the metadata is mapped back to level values by linear
 * interpolation (levels `[10, 20]` with a native score of 0.8 give 18).
 *
 * @param native - The native response body.
 * @param questions - The questions that were asked, keyed by dotted id.
 * @returns The vendor-neutral decision response.
 * @throws DecisionResponseError when an answer is missing, has the wrong type,
 * names an option or level the question does not define, or carries a
 * non-numeric score, confidence, noul or probability.
 */
export function fromNativeResponse(
  native: NativeResponse,
  questions: Record<string, Decision.Question>,
): Decision.Response {
  let value: Tree = {};
  const meta: Decision.MetaJson = {};

  for (const [id, question] of Object.entries(questions)) {
    const answer = native.answers?.[id];
    if (!answer) {
      throw new DecisionResponseError(`Missing answer for question "${id}"`);
    }
    const mapped = mapAnswer(id, question, answer);
    value = setPath(value, id.split('.'), mapped.value);
    meta[id] = mapped.meta;
  }

  return {
    kind: 'hashbrown.decision',
    version: 1,
    value,
    meta,
    ...(native.usage
      ? {
          usage: {
            inputTokens: native.usage.input_tokens,
            outputTokens: native.usage.output_tokens,
          },
        }
      : {}),
  };
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkProbabilities(
  id: string,
  probabilities: unknown,
): Record<string, number> {
  if (
    typeof probabilities !== 'object' ||
    probabilities === null ||
    Array.isArray(probabilities) ||
    !Object.values(probabilities).every(isNumber)
  ) {
    throw new DecisionResponseError(
      `Answer for "${id}" has probabilities that are not a map of numbers`,
    );
  }
  return probabilities as Record<string, number>;
}

function checkNumber(id: string, field: string, value: unknown): number {
  if (!isNumber(value)) {
    throw new DecisionResponseError(
      `Answer for "${id}" has a ${field} that is not a finite number`,
    );
  }
  return value;
}

/**
 * Maps a weighted score in index space (0 to levels - 1) to level-value space
 * by linear interpolation between neighbouring level values.
 */
function interpolate(values: readonly number[], index: number): number {
  const clamped = Math.min(values.length - 1, Math.max(0, index));
  const lower = Math.floor(clamped);
  const upper = Math.min(values.length - 1, lower + 1);
  const fraction = clamped - lower;
  return values[lower] + fraction * (values[upper] - values[lower]);
}

function mapAnswer(
  id: string,
  question: Decision.Question,
  answer: NativeAnswer,
): { value: Decision.JsonValue; meta: Decision.MetaJson[string] } {
  if (typeof answer !== 'object' || answer === null) {
    throw new DecisionResponseError(`Answer for "${id}" is not an object`);
  }
  const expected = question.type === 'yesNo' ? 'noul' : question.type;
  if (answer.type !== expected) {
    throw new DecisionResponseError(
      `Answer for "${id}" has type "${answer.type}", expected "${expected}"`,
    );
  }

  if (question.type === 'choice' && answer.type === 'choice') {
    if (
      typeof answer.choice !== 'string' ||
      !Object.prototype.hasOwnProperty.call(question.options, answer.choice)
    ) {
      throw new DecisionResponseError(
        `Answer for "${id}" chose "${answer.choice}", which is not one of its options`,
      );
    }
    return {
      value: answer.choice,
      meta: {
        confidence: checkNumber(id, 'confidence', answer.confidence),
        probabilities: checkProbabilities(id, answer.probabilities),
      },
    };
  }

  if (question.type === 'score' && answer.type === 'score') {
    const keys = orderedLevelKeys(question.levels);
    const values = keys.map(Number);
    const bad = keys.find((_, i) => !Number.isFinite(values[i]));
    if (bad !== undefined) {
      throw new DecisionResponseError(
        `Score level "${bad}" for "${id}" is not numeric`,
      );
    }
    const score = checkNumber(id, 'score', answer.score);
    const confidence = checkNumber(id, 'confidence', answer.confidence);
    const indexed = checkProbabilities(id, answer.probabilities);
    const index = mostProbableIndex(keys.length, indexed);
    const probabilities = Object.fromEntries(
      Object.entries(indexed).map(([i, p]) => [keys[Number(i)] ?? i, p]),
    );
    return {
      value: values[index],
      meta: {
        confidence,
        score: interpolate(values, score),
        probabilities,
      },
    };
  }

  if (answer.type === 'noul') {
    const noul = checkNumber(id, 'noul', answer.noul);
    return {
      value: noul >= 0.5,
      meta: { probability: noul },
    };
  }

  throw new DecisionResponseError(`Unsupported answer for "${id}"`);
}

/**
 * The level index with the highest probability. Rounding the weighted score
 * instead would pick a level between two peaks that the model never chose.
 * Ties take the lower level; indexes outside the levels are ignored.
 */
function mostProbableIndex(
  levels: number,
  probabilities: Record<string, number>,
): number {
  let best = 0;
  for (let i = 1; i < levels; i++) {
    if ((probabilities[String(i)] ?? 0) > (probabilities[String(best)] ?? 0)) {
      best = i;
    }
  }
  return best;
}

function setPath(tree: Tree, path: string[], value: Decision.JsonValue): Tree {
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...tree, [head]: value };
  const child = tree[head];
  const next =
    child && typeof child === 'object' && !Array.isArray(child)
      ? (child as Tree)
      : {};
  return { ...tree, [head]: setPath(next, rest, value) };
}
