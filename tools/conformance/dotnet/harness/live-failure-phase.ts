const phasesByGroup = Object.freeze({
  'mixed-native-tools': Object.freeze([
    'mixed-before-pending-save',
    'mixed-continuation',
    'mixed-completion',
  ] as const),
  'native-approval': Object.freeze([
    'native-pending',
    'native-continuation',
    'native-followup',
    'native-final-proof',
  ] as const),
});

/** Static assertion phases; these labels never attest successful native work. */
export type LiveFailurePhase =
  (typeof phasesByGroup)[keyof typeof phasesByGroup][number];

/** Complete fixed phase vocabulary permitted in failed-outcome diagnostics. */
export const LIVE_FAILURE_PHASES = Object.freeze(
  Object.values(phasesByGroup).flat(),
);

/** Selects the latest group-specific phase and rejects malformed annotations without coercing or exposing them. */
export function selectLiveFailurePhase(
  group: unknown,
  annotations: unknown,
): Readonly<{ valid: boolean; phase?: LiveFailurePhase }> {
  try {
    if (!Array.isArray(annotations)) return { valid: false };
    const allowed =
      typeof group === 'string' && Object.hasOwn(phasesByGroup, group)
        ? (
            phasesByGroup as Readonly<
              Record<string, readonly LiveFailurePhase[]>
            >
          )[group]
        : undefined;
    let phase: LiveFailurePhase | undefined;
    let count = 0;
    for (const annotation of annotations) {
      if (!annotation || typeof annotation !== 'object') continue;
      const row = annotation as Record<string, unknown>;
      if (row['type'] !== 'live-phase') continue;
      if (
        ++count > 32 ||
        typeof row['description'] !== 'string' ||
        !allowed?.includes(row['description'] as LiveFailurePhase)
      )
        return { valid: false };
      phase = row['description'] as LiveFailurePhase;
    }
    return { valid: true, ...(phase ? { phase } : {}) };
  } catch {
    return { valid: false };
  }
}
