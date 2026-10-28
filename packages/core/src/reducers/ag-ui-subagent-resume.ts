import type { PendingInterruptBatch, ResumeOptions } from '../models/interrupt';
import type { SubagentRun } from '../models/subagent-run';
import {
  type ɵAgUiSubagentsState,
  ɵcreateAgUiSubagentsState,
} from './ag-ui-subagents';
import type { Message } from '@ag-ui/core';

/** The exact accepted claim whose acknowledgement can resolve waiting rows. @internal */
export interface ɵSubagentResumeClaim {
  readonly claimId: string;
  readonly generationId: string;
  readonly batch: PendingInterruptBatch;
  readonly options: ResumeOptions;
}

/** Owns the records array without changing unchanged sibling record identities. @internal */
export function ɵfreezeSubagentState(
  state: ɵAgUiSubagentsState,
): ɵAgUiSubagentsState {
  return Object.isFrozen(state.records)
    ? state
    : { ...state, records: Object.freeze([...state.records]) };
}

/** Restores native owners and explicitly supplied waiting interrupt associations. @internal */
export function ɵseedSubagentState(
  history: readonly Readonly<Message>[],
  batch?: PendingInterruptBatch,
): ɵAgUiSubagentsState {
  const state = ɵcreateAgUiSubagentsState(history);
  return ɵassociateSubagentInterrupts(state, batch);
}

/** Associates explicitly tagged pending interrupts without overriding terminal lifecycle facts. @internal */
export function ɵassociateSubagentInterrupts(
  state: ɵAgUiSubagentsState,
  batch?: PendingInterruptBatch,
): ɵAgUiSubagentsState {
  let records = state.records;
  for (const interrupt of batch?.interrupts ?? []) {
    if (interrupt.subagentRunId === undefined) continue;
    const existing = records.find(
      (record) => record.subagentRunId === interrupt.subagentRunId,
    );
    if (
      existing &&
      ['complete', 'failed', 'cancelled'].includes(existing.status)
    )
      continue;
    const record: SubagentRun = Object.freeze({
      ...existing,
      subagentRunId: interrupt.subagentRunId,
      status: 'awaiting',
      interruptIds: Object.freeze([
        ...new Set([...(existing?.interruptIds ?? []), interrupt.id]),
      ]),
    });
    records = existing
      ? records.map((current) => (current === existing ? record : current))
      : [...records, record];
  }
  return ɵfreezeSubagentState({ ...state, records });
}

/** Resolves only answered waiting rows and their fully answered suspended ancestors. @internal */
export function ɵacknowledgeSubagentResume(
  state: ɵAgUiSubagentsState,
  claim: ɵSubagentResumeClaim,
): ɵAgUiSubagentsState {
  const entries = new Map(
    claim.options.entries.map((entry) => [entry.interruptId, entry]),
  );
  const interruptOwners = new Map(
    claim.batch.interrupts.map((interrupt) => [
      interrupt.id,
      interrupt.subagentRunId,
    ]),
  );
  const related = (candidate: SubagentRun, ancestor: SubagentRun): boolean => {
    const seen = new Set<string>();
    let current: SubagentRun | undefined = candidate;
    while (current && !seen.has(current.subagentRunId)) {
      if (current.subagentRunId === ancestor.subagentRunId) return true;
      seen.add(current.subagentRunId);
      current = state.records.find(
        (record) => record.subagentRunId === current?.parentSubagentRunId,
      );
    }
    return false;
  };
  const records = state.records.map((record) => {
    if (record.status !== 'awaiting') return record;
    const descendants = state.records.filter((candidate) =>
      related(candidate, record),
    );
    const ids = new Set(
      descendants.flatMap((candidate) => candidate.interruptIds ?? []),
    );
    for (const [id, owner] of interruptOwners) {
      if (descendants.some((candidate) => candidate.subagentRunId === owner))
        ids.add(id);
    }
    if (![...ids].some((id) => entries.has(id))) return record;
    const remaining = [...ids].filter((id) => !entries.has(id));
    if (remaining.length) {
      const ownRemaining = record.interruptIds?.filter(
        (id) => !entries.has(id),
      );
      return ownRemaining?.length === record.interruptIds?.length
        ? record
        : Object.freeze({
            ...record,
            interruptIds: Object.freeze(ownRemaining ?? []),
          });
    }
    return Object.freeze({
      ...record,
      status: [...ids].some((id) => entries.get(id)?.status === 'cancelled')
        ? ('cancelled' as const)
        : ('unknown' as const),
      interruptIds: Object.freeze([]),
    });
  });
  return records.every((record, index) => record === state.records[index])
    ? state
    : { ...state, records: Object.freeze(records) };
}
