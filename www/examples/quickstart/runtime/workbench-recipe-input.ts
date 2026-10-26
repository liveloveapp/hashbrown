import type { WorkbenchApplication } from './workbench';

/** Projects an immutable application snapshot into detached SDK-compatible JSON. */
export function workbenchApplicationInput(application: WorkbenchApplication) {
  return {
    revision: application.revision,
    nextAction: application.nextAction ?? null,
    selectedView: application.selectedView ?? null,
    acceptedActions: [...(application.acceptedActions ?? [])],
    plan: application.plan
      ? { title: application.plan.title, steps: [...application.plan.steps] }
      : null,
  };
}

/** Reads single-selection confidence from genuine SDK metadata, rejecting malformed values. */
export function workbenchSelectionConfidence(meta: unknown): number | null {
  if (!meta || typeof meta !== 'object' || !('pick' in meta)) return null;
  const pick = meta.pick;
  if (!pick || typeof pick !== 'object' || !('confidence' in pick)) return null;
  const confidence = pick.confidence;
  return typeof confidence === 'number' &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1
    ? confidence
    : null;
}
