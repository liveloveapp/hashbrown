/**
 * A JSON value accepted as `state` by the TypeSafe API.
 *
 * @public
 */
export type NativeJson =
  | string
  | number
  | boolean
  | null
  | NativeJson[]
  | { [key: string]: NativeJson };

/**
 * A question in the TypeSafe `systemone` request dialect.
 *
 * Documented at https://docs.typesafe.ai/api.md: `choice` takes a map of
 * option names to descriptions, `score` takes an ordered array of level
 * descriptions, and `noul` takes optional `true`/`false` descriptions.
 *
 * @public
 */
export type NativeQuestion =
  | {
      type: 'choice';
      instructions: string;
      criteria: Record<string, string | null>;
    }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'noul'; instructions: string };

/**
 * The request body for `POST /v1/systemone`.
 *
 * @public
 */
export type NativeRequest = {
  model: string;
  state: NativeJson;
  questions: Record<string, NativeQuestion>;
};

/**
 * An answer in the TypeSafe response dialect.
 */
export type NativeAnswer =
  | {
      type: 'choice';
      choice: string;
      probabilities: Record<string, number>;
      confidence: number;
    }
  | {
      type: 'score';
      score: number;
      legend?: Record<string, string>;
      probabilities: Record<string, number>;
      confidence: number;
    }
  | { type: 'noul'; noul: number };

/**
 * The response body of `POST /v1/systemone`.
 */
export type NativeResponse = {
  model?: string;
  answers: Record<string, NativeAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
};
