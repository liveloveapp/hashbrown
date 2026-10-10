import { starterPrompts } from '@atc/shared';
import { useAtcState } from './store';

/**
 * What the chat shows before the first message: a question and starter
 * pills, led by "What's the plane I selected?" while a plane is selected.
 */
export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const selected = useAtcState().selectedHex !== null;

  return (
    <div className="atc-empty">
      <p className="atc-empty-title">
        Ask about the planes over the Pacific Northwest.
      </p>
      <div className="atc-starters">
        {starterPrompts(selected).map((prompt) => (
          <button key={prompt} type="button" onClick={() => onPick(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
