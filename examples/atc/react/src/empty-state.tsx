import { STARTER_PROMPTS } from '@atc/shared';

/** What the chat shows before the first message: a question and starter pills. */
export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="atc-empty">
      <p className="atc-empty-title">
        Ask about the planes over the Pacific Northwest.
      </p>
      <div className="atc-starters">
        {STARTER_PROMPTS.map((prompt) => (
          <button key={prompt} type="button" onClick={() => onPick(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
