import {
  validateWorkbenchRecordingCues,
  type WorkbenchRecordingCue,
} from './workbench-recording-cues';

/** Measured gates required before publishing the two production reference recordings. */
export interface ProductionRecordingEvidence {
  readonly source: string;
  readonly initialProcessId: number;
  readonly replacementProcessId: number;
  readonly runRequestsBeforeRestore: number;
  readonly runRequestsAfterRestore: number;
  readonly runRequestsBeforeReplay: number;
  readonly runRequestsAfterReplay: number;
  readonly revision: number;
  readonly receipts: number;
  readonly restoredInterrupts: number;
}

/** Rejects simulated/repeated-effect footage and recovery or playback that generated a run. */
export function verifyProductionRecording(
  evidence: ProductionRecordingEvidence,
): void {
  if (evidence.source !== 'b4run-postgres-openai')
    throw new Error('A live b4.run/Postgres/OpenAI recording is required.');
  if (
    !Number.isSafeInteger(evidence.initialProcessId) ||
    !Number.isSafeInteger(evidence.replacementProcessId) ||
    evidence.initialProcessId <= 0 ||
    evidence.replacementProcessId <= 0 ||
    evidence.initialProcessId === evidence.replacementProcessId
  )
    throw new Error('An actual server restart is required.');
  if (
    evidence.runRequestsBeforeRestore !== 1 ||
    evidence.runRequestsAfterRestore !== evidence.runRequestsBeforeRestore ||
    evidence.restoredInterrupts !== 1
  )
    throw new Error(
      'Restore must recover one approval without generating a run.',
    );
  if (
    evidence.runRequestsBeforeReplay !== 2 ||
    evidence.runRequestsAfterReplay !== evidence.runRequestsBeforeReplay
  )
    throw new Error('Replay must remain read-only.');
  if (evidence.revision !== 1 || evidence.receipts !== 1)
    throw new Error(
      'Approval must commit one application revision and receipt.',
    );
}

/** Builds readable captions from actual pause, process replacement, recovery and approval phases. */
export function productionRecordingCues(
  phases: Readonly<Record<string, number>>,
  duration: number,
): readonly WorkbenchRecordingCue[] {
  const steps = [
    ['paused', 'Real OpenAI output. The server tool pauses for approval.'],
    ['restarted', 'Restart the server. Postgres keeps the paused turn.'],
    ['restored', 'Restore the conversation. No model request.'],
    ['approved', 'Approve once. The plan commits at revision 1.'],
    ['replay', 'Inspect the saved plan and the resumed response.'],
    ['returnedLive', 'Replay captured events. No requests or writes.'],
  ];
  let previous = 0;
  const cues: WorkbenchRecordingCue[] = steps.map(([name, text]) => {
    const to = phases[name];
    const from = previous;
    previous = to;
    return [from, to, text];
  });
  cues.push([previous, duration, 'Back live. Plan revision 1.']);
  validateWorkbenchRecordingCues(cues, duration, 1);
  return cues;
}
