import { useEffect, useRef, useState } from 'react';
import { experimental_chrome } from '@hashbrownai/core';
import { useStructuredChat } from '@hashbrownai/react';
import {
  getNativeLanguageModel,
  getReadyTripBrief,
  prepareLocalModel,
  tripBriefSchema,
} from '../../runtime/local-models';

const transport = experimental_chrome({
  outputLanguage: 'en',
  events: {
    downloadRequired: () => {
      throw new Error(
        'Model download required. Select Prepare model, then try again.',
      );
    },
  },
});

/** Extracts a complete trip brief with an explicitly prepared browser model. */
export function LocalModels() {
  const [prompt, setPrompt] = useState('Three days in Lisbon.');
  const [preparation, setPreparation] = useState<{
    state: 'idle' | 'preparing' | 'ready' | 'error';
    progress?: number;
    issue?: string;
  }>({ state: 'idle' });
  const [requestId, setRequestId] = useState<string>();
  const [stopped, setStopped] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const chat = useStructuredChat({
    schema: tripBriefSchema,
    system:
      'Extract the destination and trip length from the request. Return a destination of 1–80 characters and an integer number of days from 1 to 14.',
    transport,
    debugName: 'local-models',
  });
  const generating =
    chat.isSending || chat.isReceiving || chat.isGenerating || chat.isLoading;
  const busy = preparation.state === 'preparing' || generating;
  const brief = getReadyTripBrief({
    requestId,
    cancelled: stopped || preparation.state !== 'ready',
    messages: chat.messages,
    isSending: chat.isSending,
    isReceiving: chat.isReceiving,
    isGenerating: chat.isGenerating,
    isLoading: chat.isLoading,
    error: chat.error,
    finishReason: chat.lastRunFinishReason,
  });
  const status = stopped
    ? 'Stopped. Prepare the model or generate again.'
    : preparation.state === 'preparing'
      ? preparation.progress === undefined
        ? 'Preparing model…'
        : `Downloading model: ${preparation.progress}%`
      : preparation.state === 'error'
        ? preparation.issue
        : generating
          ? 'Generating locally…'
          : requestId && chat.error
            ? 'Generation failed. Select Prepare model, then generate again.'
            : brief
              ? 'Trip brief ready.'
              : requestId
                ? 'No complete valid trip brief. Generate locally to try again.'
                : preparation.state === 'ready'
                  ? 'Model ready. Generate locally.'
                  : 'Prepare the model to begin.';

  useEffect(() => () => controller.current?.abort(), []);

  async function prepare() {
    if (busy || controller.current) return;
    const next = new AbortController();
    controller.current = next;
    setStopped(false);
    setRequestId(undefined);
    setPreparation({ state: 'preparing' });
    try {
      await prepareLocalModel({
        model: getNativeLanguageModel(),
        signal: next.signal,
        onProgress: (progress) => {
          if (!next.signal.aborted && controller.current === next)
            setPreparation({ state: 'preparing', progress });
        },
      });
      if (!next.signal.aborted && controller.current === next)
        setPreparation({ state: 'ready' });
    } catch (error: unknown) {
      if (!next.signal.aborted && controller.current === next)
        setPreparation({
          state: 'error',
          issue:
            error instanceof Error
              ? `${error.message} Check Chrome support and select Prepare model to try again.`
              : 'Preparation failed. Check Chrome support and select Prepare model to try again.',
        });
    } finally {
      if (controller.current === next) controller.current = undefined;
    }
  }

  function generate() {
    if (busy || preparation.state !== 'ready' || !prompt.trim()) return;
    const id = crypto.randomUUID();
    setStopped(false);
    setRequestId(id);
    chat.setMessages([{ id, role: 'user', content: prompt.trim() }]);
  }

  function cancel() {
    if (!busy) return;
    setStopped(true);
    if (controller.current) {
      controller.current.abort();
      controller.current = undefined;
      setPreparation({ state: 'idle' });
    }
    if (generating) chat.stop();
  }

  return (
    <main>
      <h1>Extract a trip brief locally</h1>
      <label htmlFor="trip-request">Trip request</label>
      <textarea
        id="trip-request"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <nav aria-label="Local model actions">
        <button type="button" disabled={busy} onClick={() => void prepare()}>
          Prepare model
        </button>
        <button
          type="button"
          disabled={busy || preparation.state !== 'ready' || !prompt.trim()}
          onClick={generate}
        >
          Generate locally
        </button>
        <button type="button" disabled={!busy} onClick={cancel}>
          Cancel
        </button>
      </nav>
      <p role="status">{status}</p>
      <h2>Trip brief</h2>
      <section
        aria-label="Trip brief"
        data-testid="trip-brief"
        aria-busy={busy}
      >
        {brief && (
          <dl>
            <dt>Destination</dt>
            <dd>{brief.destination}</dd>
            <dt>Days</dt>
            <dd>{brief.days}</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
