import { useRef, useState } from 'react';
import { useStructuredChat } from '@hashbrownai/react';
import {
  getApplicableShoppingList,
  type ShoppingList,
  shoppingListSchema,
} from '../../runtime/shopping-list';

/** Generates a reviewable draft and applies a validated copy to local state. */
export function StructuredList() {
  const [prompt, setPrompt] = useState('Add 2 apples and 1 loaf of bread.');
  const [request, setRequest] = useState<{ id: string; cancelled: boolean }>();
  const currentRequest = useRef(request);
  const [applied, setApplied] = useState<ShoppingList>();
  const chat = useStructuredChat({
    schema: shoppingListSchema,
    system:
      'Turn the request into a shopping list. Use 1–10 items, names of 1–80 characters, and integer quantities from 1–20.',
  });
  const run = {
    requestId: request?.id,
    cancelled: request?.cancelled ?? false,
    messages: chat.messages,
    isSending: chat.isSending,
    isReceiving: chat.isReceiving,
    isGenerating: chat.isGenerating,
    isLoading: chat.isLoading,
    error: chat.error,
    finishReason: chat.lastRunFinishReason,
  };
  const candidate = getApplicableShoppingList(run);
  const busy = chat.isSending || chat.isLoading;
  const draft = chat.lastAssistantMessage?.content;
  const status = request?.cancelled
    ? 'Generation cancelled. Generate another draft to continue.'
    : chat.error
      ? 'Could not generate a valid draft. Try generating again.'
      : busy
        ? 'Generating draft. Complete items appear as they arrive.'
        : chat.lastRunFinishReason && chat.lastRunFinishReason !== 'stop'
          ? 'Generation ended before a complete draft. Generate another draft.'
          : candidate
            ? 'Draft ready. Review the items, then apply the list.'
            : request
              ? 'Draft does not meet the list rules. Generate another draft.'
              : 'Describe your list, then generate a draft.';

  function generate() {
    const next = { id: crypto.randomUUID(), cancelled: false };
    currentRequest.current = next;
    setRequest(next);
    // This component generates independent lists, so each request replaces its history.
    chat.setMessages([{ id: next.id, role: 'user', content: prompt }]);
  }
  function cancel() {
    if (!currentRequest.current) return;
    const next = { ...currentRequest.current, cancelled: true };
    currentRequest.current = next;
    setRequest(next);
    chat.stop();
  }
  function apply() {
    // Recheck at the event boundary; Generate and Cancel invalidate synchronously.
    const list = getApplicableShoppingList({
      ...run,
      requestId: currentRequest.current?.id,
      cancelled: currentRequest.current?.cancelled ?? false,
    });
    if (list) setApplied(list);
  }

  return (
    <main>
      <h1>Turn a request into a shopping list</h1>
      <label htmlFor="shopping-request">Shopping request</label>
      <textarea
        id="shopping-request"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <nav aria-label="Draft actions">
        <button
          type="button"
          disabled={!prompt.trim() || busy}
          onClick={generate}
        >
          Generate draft
        </button>
        <button
          type="button"
          disabled={!busy || request?.cancelled}
          onClick={cancel}
        >
          Cancel
        </button>
        <button type="button" disabled={!candidate} onClick={apply}>
          Apply list
        </button>
      </nav>
      <p role="status">{status}</p>
      <p>
        List rules: 1–10 items, names of 1–80 characters, quantities from 1–20.
      </p>
      <h2>Draft list</h2>
      <ul data-testid="draft-list">
        {draft?.items?.map((item, index) => (
          <li key={index}>
            {item.quantity} × {item.name}
          </li>
        ))}
      </ul>
      <h2>Applied list</h2>
      <ul data-testid="applied-list">
        {applied?.items.map((item, index) => (
          <li key={index}>
            {item.quantity} × {item.name}
          </li>
        ))}
      </ul>
      <p>
        The applied list is saved only in this component. Refreshing clears it.
      </p>
    </main>
  );
}
