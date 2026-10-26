/** One synthetic operation performed by the application's local workflow tools. */
export interface WorkflowOperation {
  readonly name: string;
  readonly record?: string;
  readonly token: string;
  readonly receipt?: string;
}

/** Observable application-owned workflow and permission state. */
export interface WorkflowSnapshot {
  readonly operations: readonly WorkflowOperation[];
  readonly pending: boolean;
}

/** Creates synthetic tools with an application-owned permission gate before side effects. */
export function createWorkflow(publish: (snapshot: WorkflowSnapshot) => void) {
  let operations: readonly WorkflowOperation[] = [];
  let decision: ((allowed: boolean) => void) | undefined;
  const snapshot = () =>
    publish({ operations, pending: decision !== undefined });
  const lookup = async ({ record }: { record: string }) => {
    const token = `HB_${record}_${crypto.randomUUID()}`;
    operations = [...operations, { name: 'lookup_secret', record, token }];
    snapshot();
    return { record, token };
  };
  const follow = async ({ token }: { token: string }) => {
    if (!operations.some((operation) => operation.token === token)) {
      throw new Error('HB_UNKNOWN_TOKEN');
    }
    const receipt = `HB_RECEIPT_${crypto.randomUUID()}`;
    operations = [...operations, { name: 'follow_secret', token, receipt }];
    snapshot();
    return { receipt };
  };
  const protectedLookup = async (
    args: { record: string },
    signal: AbortSignal,
  ) => {
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('HB_PERMISSION_CANCELLED'));
        return;
      }
      if (decision) {
        reject(new Error('HB_PERMISSION_ALREADY_PENDING'));
        return;
      }
      const settle = (allowed: boolean, cancelled = false) => {
        signal.removeEventListener('abort', onAbort);
        decision = undefined;
        snapshot();
        if (allowed) resolve();
        else
          reject(
            new Error(
              cancelled ? 'HB_PERMISSION_CANCELLED' : 'HB_PERMISSION_DENIED',
            ),
          );
      };
      const onAbort = () => settle(false, true);
      decision = settle;
      signal.addEventListener('abort', onAbort, { once: true });
      snapshot();
    });
    if (signal.aborted) throw new Error('HB_PERMISSION_CANCELLED');
    return lookup(args);
  };
  return {
    lookup,
    follow,
    protectedLookup,
    decide: (allowed: boolean) => decision?.(allowed),
  };
}
