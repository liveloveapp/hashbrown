import { labelForHex, type ToolCallLike, toolRunView } from '@atc/shared';
import { useState } from 'react';
import { useAtcState } from './store';

/**
 * One assistant turn's tool calls. Finished calls fold into one summary line
 * ("Searched traffic, looked up 6 routes") that expands to every step; a
 * running call shows live with a spinner, such as "Finding aircraft ·
 * approaching KSEA". A call only spins while the chat is busy, so it always
 * settles.
 */
export function ToolChips({
  calls,
  busy = false,
}: {
  calls: readonly ToolCallLike[];
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const run = toolRunView(calls, busy, labelForHex(useAtcState()));

  return (
    <div className="atc-tool-run">
      {run.summary ? (
        <button
          type="button"
          className="atc-tool-summary"
          data-testid="tool-summary"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="atc-tool-dot" aria-hidden="true" />
          <span className="atc-tool-summary-text">{run.summary}</span>
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
      {open ? (
        <ol className="atc-tool-steps">
          {run.chips.map((chip, index) => (
            <li
              key={index}
              className="atc-tool-chip"
              data-testid="tool-step"
              data-state={chip.state}
            >
              {chip.label}
              {chip.state === 'failed' || chip.state === 'stopped' ? (
                <span className="atc-tool-note"> · {chip.state}</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {run.live.map((chip, index) => (
        <span
          key={index}
          className="atc-tool-chip"
          data-testid="tool-chip"
          data-state="running"
        >
          <span className="atc-tool-spinner" aria-hidden="true" />
          {chip.label}
        </span>
      ))}
    </div>
  );
}
