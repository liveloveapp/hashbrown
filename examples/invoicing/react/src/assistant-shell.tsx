/** Inputs for {@link AssistantShell}. */
export interface AssistantShellProps {
  /** The suggested questions to offer, as `startersFor` builds them for the current focus. */
  readonly starters: readonly string[];
  /** The starter the user picked while the assistant was loading, if any. */
  readonly pending?: string;
  /** Called with the starter the user picked; ignored once one is pending. */
  readonly onStart: (prompt: string) => void;
}

/**
 * What the assistant rail shows while the assistant code is still loading:
 * the same starter questions, usable at once. A starter picked now is held and
 * sent as soon as the assistant arrives.
 */
export function AssistantShell({
  starters,
  pending,
  onStart,
}: AssistantShellProps) {
  return (
    <section className="conversation">
      <div className="thread">
        <div className="starters" role="group" aria-label="Suggested questions">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              aria-disabled={Boolean(pending)}
              onClick={() => {
                if (pending) return;
                onStart(starter);
              }}
            >
              {starter}
            </button>
          ))}
        </div>
        <p className="muted" role="status">
          {pending
            ? `Sending “${pending}” as soon as the assistant connects…`
            : 'Connecting the assistant…'}
        </p>
      </div>
    </section>
  );
}
