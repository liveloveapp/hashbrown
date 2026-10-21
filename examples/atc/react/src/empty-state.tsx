import { SELECTED_PROMPT, type Starter, starterPrompts } from '@atc/shared';
import { useId } from 'react';
import { useAtcState } from './store';

/** One labelled group of starter pills. */
function StarterGroup({
  label,
  starters,
  onPick,
}: {
  label: string;
  starters: readonly Starter[];
  onPick: (starter: Starter) => void;
}) {
  const headingId = useId();

  return (
    <div className="atc-starter-group" role="group" aria-labelledby={headingId}>
      <h2 id={headingId} className="atc-starter-heading">
        {label}
      </h2>
      <div className="atc-starters">
        {starters.map((starter) => (
          <button
            key={starter.text}
            type="button"
            data-lead={starter.text === SELECTED_PROMPT ? '' : undefined}
            onClick={() => onPick(starter)}
          >
            {starter.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * What the chat shows before the first message: a question and starter
 * pills in two groups, "Filter the map" first and then "Ask a question",
 * which leads with "What's the plane I selected?" while a plane is selected
 * (marked `data-lead`, so the phone peek's single row shows it first).
 * `onPick` gets the starter with its route: starters skip the router.
 */
export function EmptyState({ onPick }: { onPick: (starter: Starter) => void }) {
  const selected = useAtcState().selectedHex !== null;
  const starters = starterPrompts(selected);

  return (
    <div className="atc-empty">
      <p className="atc-empty-title">
        Filter the map or ask about the planes overhead.
      </p>
      <StarterGroup
        label="Filter the map"
        starters={starters.filter((starter) => starter.route === 'filter')}
        onPick={onPick}
      />
      <StarterGroup
        label="Ask a question"
        starters={starters.filter((starter) => starter.route !== 'filter')}
        onPick={onPick}
      />
    </div>
  );
}
