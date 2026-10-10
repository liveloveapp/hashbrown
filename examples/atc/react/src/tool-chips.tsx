import { type ToolCallLike, toolChipView } from '@atc/shared';

/**
 * One chip per tool call, e.g. `findAircraft · approaching SEA`. A chip only
 * spins while its call is pending and the chat is busy, so it always settles.
 */
export function ToolChips({
  calls,
  busy = false,
}: {
  calls: readonly ToolCallLike[];
  busy?: boolean;
}) {
  return (
    <div className="atc-tool-chips">
      {calls.map((call, index) => {
        const chip = toolChipView(call, busy);

        return (
          <span
            key={index}
            className="atc-tool-chip"
            data-testid="tool-chip"
            data-state={chip.state}
          >
            {chip.state === 'running' ? (
              <span className="atc-tool-spinner" aria-hidden="true" />
            ) : (
              <span className="atc-tool-dot" aria-hidden="true" />
            )}
            {chip.label}
            {chip.state === 'failed' ? (
              <span className="atc-tool-note">· failed</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
