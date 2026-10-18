import type { Decision } from '@hashbrownai/core';
import { orderedLevelKeys } from './levels';
import type { NativeJson, NativeQuestion, NativeRequest } from './native.types';

/**
 * Maps a Hashbrown decision request to the TypeSafe `systemone` dialect.
 *
 * Yes/no questions become `noul`, choice options become `criteria`, and score
 * levels become an ordered `criteria` array. The `longContext` option does not
 * change the body; it only affects the transport.
 *
 * @param request - The vendor-neutral decision request.
 * @param model - The TypeSafe model name, such as `jev-latest`.
 * @returns The native request body.
 */
export function toNativeRequest(
  request: Decision.Request,
  model: string,
): NativeRequest {
  const questions = Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => [
      id,
      toNativeQuestion(question),
    ]),
  );

  return { model, state: request.state as NativeJson, questions };
}

function toNativeQuestion(question: Decision.Question): NativeQuestion {
  switch (question.type) {
    case 'choice':
      return {
        type: 'choice',
        instructions: question.instructions,
        criteria: { ...question.options },
      };
    case 'score':
      return {
        type: 'score',
        instructions: question.instructions,
        criteria: orderedLevelKeys(question.levels).map(
          (key) => question.levels[key],
        ),
      };
    case 'yesNo':
      return { type: 'noul', instructions: question.instructions };
  }
}
