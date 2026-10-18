/**
 * Thrown when a schema cannot be compiled into decision questions.
 *
 * @public
 */
export class DecisionSchemaError extends Error {
  constructor(
    message: string,
    /** Dotted path to the offending schema node. */
    readonly path: string,
  ) {
    super(message);
    this.name = 'DecisionSchemaError';
  }
}

/**
 * Thrown when a decision response is malformed or does not match the schema.
 *
 * @public
 */
export class DecisionResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecisionResponseError';
  }
}
