/** Deliberate actual-process, database, transport and native-input faults available only to deterministic controls. */
export type ReleaseRecoveryControlMutation =
  | 'missing-usage'
  | 'hold-finalization'
  | 'reused-worker'
  | 'missing-drain'
  | 'schema-reset'
  | 'handler-replay'
  | 'effect-replay'
  | 'wrong-original-result'
  | 'missing-original-result'
  | 'duplicate-original-call'
  | 'duplicate-original-result'
  | 'late-dispatch'
  | 'malformed-completed-history'
  | 'read-induced-work'
  | 'cleanup-crash';
