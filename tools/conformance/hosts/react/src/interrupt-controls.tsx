import type { PendingInterruptBatch, ResumeOptions } from '@hashbrownai/core';
import { useState } from 'react';

interface InterruptControlsProps {
  readonly disabled?: boolean;
  readonly batch: PendingInterruptBatch | undefined;
  readonly isResuming: boolean;
  readonly resume: (options: ResumeOptions) => void;
}

/** Displays a batch and submits a complete fixture response through the public API. */
export function InterruptControls({
  disabled = false,
  batch,
  isResuming,
  resume,
}: InterruptControlsProps) {
  const [error, setError] = useState('');
  const [capturedResume, setCapturedResume] = useState<
    (() => void) | undefined
  >();

  function submit(
    decision: 'approve' | 'decline' | 'cancel' | 'mixed' = 'approve',
  ) {
    if (!batch) return;
    setError('');
    try {
      resume({
        batchId: batch.id,
        entries: batch.interrupts.map(({ id }, index) => {
          const selected =
            decision === 'mixed'
              ? (['approve', 'decline', 'cancel'] as const)[index]
              : decision;
          return {
            interruptId: id,
            status: selected === 'cancel' ? 'cancelled' : 'resolved',
            ...(selected === 'cancel'
              ? {}
              : { payload: { approved: selected === 'approve' } }),
          };
        }),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  /** Captures an intentionally stale public command solely for fixture guard verification. */
  function captureResume() {
    if (!batch) return;
    const options: ResumeOptions = {
      batchId: batch.id,
      entries: batch.interrupts.map(({ id }) => ({
        interruptId: id,
        status: 'resolved',
        payload: { approved: true },
      })),
    };
    setCapturedResume(() => () => resume(options));
  }

  /** Replays the captured command without using it as current batch ownership. */
  function replayCapturedResume() {
    setError('');
    try {
      capturedResume?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section>
      <ul>
        {batch?.interrupts.map((interrupt) => (
          <li key={interrupt.id} data-testid="interrupt-message">
            {interrupt.message ?? interrupt.reason}
          </li>
        ))}
      </ul>
      <div data-testid="interrupt-count">{batch?.interrupts.length ?? 0}</div>
      <div data-testid="interrupt-batch-id">{batch?.id ?? ''}</div>
      <div data-testid="is-resuming">{String(isResuming)}</div>
      <button
        data-testid="resume"
        type="button"
        disabled={disabled || !batch || isResuming}
        onClick={() => submit()}
      >
        Resume
      </button>
      <button
        data-testid="decline"
        type="button"
        disabled={disabled || !batch || isResuming}
        onClick={() => submit('decline')}
      >
        Decline
      </button>
      <button
        data-testid="cancel"
        type="button"
        disabled={disabled || !batch || isResuming}
        onClick={() => submit('cancel')}
      >
        Cancel
      </button>
      <button
        data-testid="mixed-decisions"
        type="button"
        disabled={disabled || batch?.interrupts.length !== 3 || isResuming}
        onClick={() => submit('mixed')}
      >
        Approve, decline, cancel
      </button>
      <button
        data-testid="capture-resume"
        type="button"
        disabled={disabled || !batch || isResuming}
        onClick={captureResume}
      >
        Capture resume command
      </button>
      <button
        data-testid="replay-captured-resume"
        type="button"
        disabled={disabled || !batch || !capturedResume || isResuming}
        onClick={replayCapturedResume}
      >
        Replay captured resume command
      </button>
      <div data-testid="resume-error">{error}</div>
    </section>
  );
}
