import { type Starter, starterPrompts } from '@atc/shared';
import { useAtcState } from './store';

/**
 * What the chat shows before the first message: a question and starter
 * pills, led by "What's the plane I selected?" while a plane is selected.
 * Each pill is tagged as a question (chat) or a filter (map), and `onPick`
 * gets the starter with its route: starters skip the router.
 */
export function EmptyState({ onPick }: { onPick: (starter: Starter) => void }) {
  const selected = useAtcState().selectedHex !== null;

  return (
    <div className="atc-empty">
      <p className="atc-empty-title">
        Ask about the planes over the Pacific Northwest.
      </p>
      <div className="atc-starters">
        {starterPrompts(selected).map((starter) => (
          <button
            key={starter.text}
            type="button"
            onClick={() => onPick(starter)}
          >
            {starter.text}
            <span className="atc-starter-kind">
              {starter.route === 'filter' ? 'filter' : 'question'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
