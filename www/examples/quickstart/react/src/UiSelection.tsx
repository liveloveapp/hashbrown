import { useUiDecision } from '@hashbrownai/react';
import { useState } from 'react';
import {
  type SelectionId,
  type SelectionItem,
  selectionItems,
  selectionOptions,
  type SelectionRequest,
} from '../../runtime/selection';

/** Summarizes app-owned product rows and their quantities. */
export function SummaryCard({ items }: { items: readonly SelectionItem[] }) {
  return (
    <section aria-label="Summary card">
      <h2>Shopping summary</h2>
      <p>{`${items.length} products`}</p>
      <p>{`${items.reduce((total, item) => total + item.quantity, 0)} total items`}</p>
    </section>
  );
}

/** Displays app-owned names and quantities as text. */
export function ItemList({ items }: { items: readonly SelectionItem[] }) {
  return (
    <section aria-label="Item list">
      <h2>Shopping items</h2>
      <ul>
        {items.map((item) => (
          <li key={item.name}>{`${item.quantity} × ${item.name}`}</li>
        ))}
      </ul>
    </section>
  );
}

/** The app supplies elements and props; the model selects only an ID. */
export const selectionCandidates = [
  { ...selectionOptions[0], element: <SummaryCard items={selectionItems} /> },
  { ...selectionOptions[1], element: <ItemList items={selectionItems} /> },
];

function RequestedView({ request }: { request: SelectionRequest | null }) {
  const picked = useUiDecision({
    input: request === null ? null : { ...request },
    candidates: selectionCandidates,
    select: 'one',
    minConfidence: 0.7,
  });
  const status =
    request === null
      ? 'Describe a view, or choose one manually.'
      : picked.error
        ? 'Could not choose a view. Try again or choose one manually.'
        : picked.isLoading || picked.decision.value === null
          ? 'Choosing a view. You can choose one manually at any time.'
          : picked.ids.length === 0
            ? 'No confident choice. Choose a view manually or try another request.'
            : 'View ready. The application supplies all product data.';

  return (
    <>
      <p role="status">{status}</p>
      {!picked.isLoading && !picked.error && picked.ui}
    </>
  );
}

/** Chooses an app-owned view with an explicit, independent manual fallback. */
export function UiSelection() {
  const [prompt, setPrompt] = useState('Show a quick overview.');
  const [request, setRequest] = useState<SelectionRequest | null>(null);
  const [manual, setManual] = useState<SelectionId | null>(null);

  function choose() {
    if (!prompt.trim()) return;
    setManual(null);
    setRequest({ requestId: crypto.randomUUID(), prompt: prompt.trim() });
  }

  function chooseManually(id: SelectionId) {
    setRequest(null);
    setManual(id);
    // Unmounting RequestedView destroys its decision runtime and aborts the request.
  }

  return (
    <main>
      <h1>Choose a view from a request</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          choose();
        }}
      >
        <label htmlFor="view-request">What would you like to see?</label>
        <input
          id="view-request"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <button type="submit" disabled={!prompt.trim()}>
          Choose a view
        </button>
      </form>
      <nav aria-label="Manual views">
        <button type="button" onClick={() => chooseManually('summary')}>
          Show summary
        </button>
        <button type="button" onClick={() => chooseManually('items')}>
          Show items
        </button>
      </nav>
      {manual ? (
        <>
          <p role="status">
            Manual view selected. Submit another request to ask the model again.
          </p>
          {manual === 'summary' ? (
            <SummaryCard items={selectionItems} />
          ) : (
            <ItemList items={selectionItems} />
          )}
        </>
      ) : (
        // A new key immediately removes old output and gives each request its own runtime.
        <RequestedView key={request?.requestId ?? 'idle'} request={request} />
      )}
    </main>
  );
}
