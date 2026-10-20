import type { DecidableSchema } from './decidable-schema';
import { compileDecision } from './compile-decision';
import type { Result } from './decision.types';
import { DecisionResponseError } from './errors';

type Kind = 'choice' | 'score' | 'yesNo';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function isProbabilities(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isNumber);
}

function matchesKind(kind: Kind, meta: unknown): boolean {
  if (!isRecord(meta)) return false;
  switch (kind) {
    case 'yesNo':
      return isNumber(meta['probability']);
    case 'choice':
      return (
        isNumber(meta['confidence']) && isProbabilities(meta['probabilities'])
      );
    case 'score':
      return (
        isNumber(meta['confidence']) &&
        isNumber(meta['score']) &&
        isProbabilities(meta['probabilities'])
      );
  }
}

function nest(flat: Record<string, unknown>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [id, entry] of Object.entries(flat)) {
    const parts = id.split('.');
    let cursor = root;
    for (const part of parts.slice(0, -1)) {
      const next = (cursor[part] ??= {}) as Record<string, unknown>;
      cursor = next;
    }
    cursor[parts[parts.length - 1]] = entry;
  }
  return root;
}

/**
 * Decodes and verifies a decision response against a decidable schema.
 *
 * Checks the envelope (`kind` and `version`), validates `value` with the
 * schema, and verifies that `meta` has exactly one entry of the right kind
 * for every question the schema compiles to. Dotted meta keys are rebuilt
 * into nested objects mirroring the schema. No partial result is ever
 * returned.
 *
 * @remarks
 * Use it on the server when an agent tool, node or route calls a decision
 * model directly, so the agent gets the same typed answers that
 * `useDecision` and `decisionResource` give the browser.
 *
 * @example
 * ```ts
 * import { decodeDecision, s } from '@hashbrownai/core';
 * import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
 *
 * const schema = s.object('Routing', {
 *   needsHuman: s.boolean('Does the customer ask for a person?'),
 * });
 *
 * async function routeTicket(state: { ticket: string }) {
 *   const response = await HashbrownTypeSafe.decide({
 *     apiKey: process.env['TYPESAFE_API_KEY'] ?? '',
 *     model: 'jev-1.14.0',
 *     schema,
 *     request: { state },
 *   });
 *   const { value, meta } = decodeDecision(schema, response);
 *   return { needsHuman: value.needsHuman, p: meta.needsHuman.probability };
 * }
 * ```
 *
 * @param schema - The decidable object schema the questions came from.
 * @param response - The untrusted decision response envelope.
 * @returns The typed value and its mirrored metadata.
 * @throws DecisionResponseError when the response is malformed or mismatched.
 *
 * @public
 */
export function decodeDecision<S extends DecidableSchema>(
  schema: S,
  response: unknown,
): Result<S> {
  if (!isRecord(response)) {
    throw new DecisionResponseError('The decision response must be an object');
  }
  if (response['kind'] !== 'hashbrown.decision') {
    throw new DecisionResponseError('Unexpected decision response kind');
  }
  if (response['version'] !== 1) {
    throw new DecisionResponseError('Unsupported decision response version');
  }
  let value: unknown;
  try {
    value = (schema as { validate(v: unknown): unknown }).validate(
      response['value'],
    );
  } catch (cause) {
    throw new DecisionResponseError(
      'The decision value does not match the schema',
      { cause },
    );
  }
  const meta = response['meta'];
  if (!isRecord(meta)) {
    throw new DecisionResponseError('The decision response meta is missing');
  }
  const questions = compileDecision(schema);
  for (const [id, question] of Object.entries(questions)) {
    if (!Object.prototype.hasOwnProperty.call(meta, id)) {
      throw new DecisionResponseError(`Missing meta for question "${id}"`);
    }
    if (!matchesKind(question.type, meta[id])) {
      throw new DecisionResponseError(
        `Meta for question "${id}" is not a valid ${question.type} entry`,
      );
    }
  }
  for (const id of Object.keys(meta)) {
    if (!Object.prototype.hasOwnProperty.call(questions, id)) {
      throw new DecisionResponseError(`Unexpected meta for "${id}"`);
    }
  }
  return { value, meta: nest(meta) } as Result<S>;
}
