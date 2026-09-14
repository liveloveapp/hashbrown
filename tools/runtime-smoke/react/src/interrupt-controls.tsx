import type { PendingInterruptBatch, ResumeOptions } from '@hashbrownai/core';
import { useState } from 'react';

interface InterruptControlsProps {
  readonly batch: PendingInterruptBatch | undefined;
  readonly isResuming: boolean;
  readonly resume: (options: ResumeOptions) => void;
}

/** Displays a batch and submits a complete fixture response through the public API. */
export function InterruptControls({
  batch,
  isResuming,
  resume,
}: InterruptControlsProps) {
  const [error, setError] = useState('');

  function submit() {
    if (!batch) return;
    setError('');
    try {
      resume({
        batchId: batch.id,
        entries: batch.interrupts.map(({ id }) => ({
          interruptId: id,
          status: 'resolved',
          payload: { approved: true },
        })),
      });
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
        disabled={!batch || isResuming}
        onClick={submit}
      >
        Resume
      </button>
      <div data-testid="resume-error">{error}</div>
    </section>
  );
}
