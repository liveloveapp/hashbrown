import type { s } from '../schema';
import type { JsonValue as CoreJsonValue } from '../utils/types';
import type { DecidableSchema } from './decidable-schema';

/**
 * A JSON value, as carried in decision requests and responses.
 *
 * @public
 */
export type JsonValue = CoreJsonValue;

/**
 * A question put to a decision model.
 *
 * - `choice`: pick one option; `options` maps option ids to optional descriptions.
 * - `score`: rate on an ordered scale; `levels` maps level ids (numeric
 *   strings) to descriptions. The scale order is the numeric order of the
 *   ids, not the record's key order.
 * - `yesNo`: a boolean question.
 *
 * @public
 */
export type Question =
  | {
      type: 'choice';
      instructions: string;
      options: Record<string, string | null>;
    }
  | { type: 'score'; instructions: string; levels: Record<string, string> }
  | { type: 'yesNo'; instructions: string };

/**
 * The vendor-neutral request sent to a decision endpoint.
 *
 * @public
 */
export type Request = {
  /** The state to decide about, as text or JSON. */
  state: string | JsonValue;
  /** The questions to answer, keyed by dotted question id. */
  questions: Record<string, Question>;
  /** Optional request options. */
  options?: { longContext?: boolean };
};

/**
 * Metadata for a `choice` answer.
 *
 * @public
 */
export type ChoiceMeta = {
  confidence: number;
  probabilities: Record<string, number>;
};

/**
 * Metadata for a `score` answer.
 *
 * @public
 */
export type ScoreMeta = {
  confidence: number;
  /** The probability-weighted score in level values; it may fall between levels. */
  score: number;
  /** Probability per level, keyed by level value. */
  probabilities: Record<string, number>;
};

/**
 * Metadata for a `yesNo` answer.
 *
 * @public
 */
export type YesNoMeta = { probability: number };

/**
 * Answer metadata keyed by dotted question id.
 *
 * @public
 */
export type MetaJson = Record<string, ChoiceMeta | ScoreMeta | YesNoMeta>;

/**
 * The vendor-neutral response returned by a decision endpoint.
 *
 * @public
 */
export type Response = {
  kind: 'hashbrown.decision';
  version: 1;
  value: JsonValue;
  meta: MetaJson;
  usage?: { inputTokens: number; outputTokens: number };
};

/**
 * Maps an inferred decision value to the metadata that mirrors it: strings
 * (enumerations) to `ChoiceMeta`, numbers to `ScoreMeta`, booleans to
 * `YesNoMeta`, and objects to a nested mapping.
 *
 * @public
 */
export type MetaOf<V> = V extends string
  ? ChoiceMeta
  : V extends boolean
    ? YesNoMeta
    : V extends number
      ? ScoreMeta
      : { [K in keyof V]: MetaOf<V[K]> };

/**
 * Metadata that mirrors the shape of a decidable schema.
 *
 * @public
 */
export type Meta<S extends DecidableSchema> = MetaOf<s.Infer<S>>;

/**
 * A typed decision result: the inferred value and its mirrored metadata.
 *
 * @public
 */
export type Result<S extends DecidableSchema> = {
  value: s.Infer<S>;
  meta: Meta<S>;
};

/**
 * Sends a decision request and resolves with the endpoint's response.
 *
 * @public
 */
export type Transport = (
  request: Request,
  signal: AbortSignal,
) => Promise<Response>;

/**
 * How many options a UI selection may choose: exactly `'one'`, or up to
 * `max` options.
 *
 * @public
 */
export type Select = 'one' | { max: number };
