/**
 * A job that will fail the same way on every attempt, such as a corrupt
 * persisted payload. The dispatcher quarantines it (`failLeasedJob` with
 * `deterministic_job_poison`) and continues with the rest of the batch.
 */
export class DeterministicLifecycleJobError extends Error {
  /** @param message - Why the job can never succeed; never contact data. */
  constructor(message: string) {
    super(message);
    this.name = 'DeterministicLifecycleJobError';
  }
}
