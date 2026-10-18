import { DecisionResponseError } from '@hashbrownai/core';
import type { Decision } from '@hashbrownai/core';
import type { NativeAnswer, NativeResponse } from './native.types';

type Tree = { [key: string]: Decision.JsonValue };

/**
 * Maps a TypeSafe `systemone` response to a Hashbrown decision response.
 *
 * Values are nested by dotted question id; metadata stays keyed by the dotted
 * id. A choice returns its option key, a `noul` answer is true at or above 0.5,
 * and a score returns the nearest level key as a number with the weighted score
 * kept in its metadata.
 *
 * @param native - The native response body.
 * @param questions - The questions that were asked, keyed by dotted id.
 * @returns The vendor-neutral decision response.
 * @throws DecisionResponseError when an answer is missing, has the wrong type,
 * or names an option or level the question does not define.
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

function mapAnswer(
  id: string,
  question: Decision.Question,
  answer: NativeAnswer,
): { value: Decision.JsonValue; meta: Decision.MetaJson[string] } {
  const expected = question.type === 'yesNo' ? 'noul' : question.type;
  if (answer.type !== expected) {
    throw new DecisionResponseError(
      `Answer for "${id}" has type "${answer.type}", expected "${expected}"`,
    );
  }

  if (question.type === 'choice' && answer.type === 'choice') {
    if (
      !Object.prototype.hasOwnProperty.call(question.options, answer.choice)
    ) {
      throw new DecisionResponseError(
        `Answer for "${id}" chose "${answer.choice}", which is not one of its options`,
      );
    }
    return {
      value: answer.choice,
      meta: {
        confidence: answer.confidence,
        probabilities: answer.probabilities,
      },
    };
  }

  if (question.type === 'score' && answer.type === 'score') {
    const keys = Object.keys(question.levels);
    const index = Math.min(
      keys.length - 1,
      Math.max(0, Math.round(answer.score)),
    );
    const level = Number(keys[index]);
    if (!Number.isFinite(level)) {
      throw new DecisionResponseError(
        `Score level "${keys[index]}" for "${id}" is not numeric`,
      );
    }
    const probabilities = Object.fromEntries(
      Object.entries(answer.probabilities).map(([i, p]) => [
        keys[Number(i)] ?? i,
        p,
      ]),
    );
    return {
      value: level,
      meta: {
        confidence: answer.confidence,
        score: answer.score,
        probabilities,
      },
    };
  }

  if (answer.type === 'noul') {
    return {
      value: answer.noul >= 0.5,
      meta: { probability: answer.noul },
    };
  }

  throw new DecisionResponseError(`Unsupported answer for "${id}"`);
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
