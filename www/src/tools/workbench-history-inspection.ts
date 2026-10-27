import { deepStrictEqual, match } from 'node:assert';
import type { WorkbenchHistorySlot } from '../../examples/quickstart/runtime/workbench-history';

/** Checks the public saved-document inspector against actual slot bytes and observed lifecycle. */
export function assertWorkbenchSavedTextInspection(
  source: unknown,
  detail: unknown,
  expected: {
    readonly slot: WorkbenchHistorySlot;
    readonly encoded: string | null;
    readonly action: string;
    readonly canSave: boolean;
    readonly successfulGeneration: boolean;
  },
): void {
  deepStrictEqual(source, {
    selectedSlot: expected.slot,
    cachedRead: {
      status: expected.encoded === null ? 'empty' : 'valid',
      document: expected.encoded === null ? null : JSON.parse(expected.encoded),
      error: null,
    },
  });
  const { note, ...operation } = detail as Record<string, unknown>;
  deepStrictEqual(operation, {
    action: expected.action,
    replacementIntent: null,
    error: null,
    canSave: expected.canSave,
    successfulGeneration: expected.successfulGeneration,
  });
  match(String(note), /Cached explicit read/);
}
