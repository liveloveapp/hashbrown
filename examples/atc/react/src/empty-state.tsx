import { type Starter, starterPrompts } from '@atc/shared';
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
  return (
    <div className="atc-starter-group" role="group" aria-label={label}>
      <h2 className="atc-starter-heading">{label}</h2>
      <div className="atc-starters">
        {starters.map((starter) => (
          <button
            key={starter.text}
            type="button"
            onClick={() => onPick(starter)}
          >
            {starter.text}
            <span className="atc-starter-hint">
              {` (${starter.route === 'filter' ? 'filter' : 'question'})`}
            </span>
            <span className="atc-starter-kind" aria-hidden="true">
              {starter.route === 'filter' ? 'filter' : 'question'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * What the chat shows before the first message: a question and starter
 * pills in two groups, "Filter the map" first and then "Ask a question",
 * which leads with "What's the plane I selected?" while a plane is selected.
 * Each pill is tagged as a question (chat) or a filter (map), and `onPick`
 * gets the starter with its route: starters skip the router.
 */
export function EmptyState({ onPick }: { onPick: (starter: Starter) => void }) {
  const selected = useAtcState().selectedHex !== null;
  const starters = starterPrompts(selected);

  return (
    <div className="atc-empty">
      <p className="atc-empty-title">
        Ask about the planes over the Pacific Northwest.
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
