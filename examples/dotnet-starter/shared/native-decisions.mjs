/** Builds the complete exact native approval wire batch without mutating interrupts. */
export function nativeDecisions(interrupts, decision) {
  return interrupts.map(({ id }) =>
    decision === 'cancel'
      ? { interruptId: id, status: 'cancelled' }
      : {
          interruptId: id,
          status: 'resolved',
          payload: { approved: decision === 'approve' },
        },
  );
}
