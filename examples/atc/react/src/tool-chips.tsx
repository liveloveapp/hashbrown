import { labelForHex, type ToolCallLike, toolRunView } from '@atc/shared';
import { useId, useState } from 'react';
import { useAtcState } from './store';

/**
 * One assistant turn's tool activity, as one quiet line. While a step runs,
 * the line says what it is doing ("Finding aircraft approaching Seattle…")
 * with a spinner and a shimmer (the transcript's status region announces
 * it, since this line sits in a busy list). Once the steps
 * finish it becomes a button with a check, what they did and how many there
 * were ("Searched traffic · 2 steps"), which expands to every step. A call
 * only runs while the chat is busy, so the line always settles.
 */
export function ToolChips({
  calls,
  busy = false,
}: {
  calls: readonly ToolCallLike[];
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const stepsId = useId();
  const run = toolRunView(calls, busy, labelForHex(useAtcState()));

  return (
    <div className="atc-tool-run">
      {run.current ? (
        <p className="atc-activity" data-testid="tool-current">
          <span className="atc-tool-spinner" aria-hidden="true" />
          <span className="atc-activity-text atc-shimmer">{run.current}</span>
        </p>
      ) : run.summary ? (
        <button
          type="button"
          className="atc-activity atc-activity-toggle"
          data-testid="tool-summary"
          aria-expanded={open}
          aria-controls={stepsId}
          onClick={() => setOpen(!open)}
        >
          <svg
            className="atc-activity-icon"
            viewBox="0 0 12 12"
            width="12"
            height="12"
            aria-hidden="true"
          >
            <path
              d="M2.5 6.2 5 8.5l4.5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="atc-activity-text">{run.summary}</span>
          <span className="atc-activity-count">{` · ${run.steps}`}</span>
          <svg
            className="atc-tool-chevron"
            viewBox="0 0 12 12"
            width="12"
            height="12"
            aria-hidden="true"
          >
            <path
              d="M3 4.5 6 7.5l3-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
      {open && !run.current ? (
        <ol className="atc-tool-steps" id={stepsId}>
          {run.chips.map((chip) => (
            <li
              key={chip.key}
              className="atc-tool-step"
              data-testid="tool-step"
              data-state={chip.state}
            >
              {chip.label}
              {chip.state === 'failed' || chip.state === 'stopped' ? (
                <span> ({chip.state})</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
