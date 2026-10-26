// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  completion: vi.fn(),
  selection: vi.fn(),
  chat: vi.fn(),
}));
vi.mock('@hashbrownai/react', () => ({
  useStructuredCompletion: sdk.completion,
  useUiDecision: sdk.selection,
  useChat: sdk.chat,
  useTool: (tool: unknown) => tool,
  MagicTextRenderer: ({
    children,
    isComplete,
    caret,
    onCitationClick,
  }: {
    children: string;
    isComplete: boolean;
    caret: boolean;
    onCitationClick: (
      event: { preventDefault(): void },
      citation: unknown,
    ) => void;
  }) => (
    <article data-final={isComplete} data-caret={caret}>
      <h2>{children}</h2>
      <button
        onClick={(event) =>
          onCitationClick(event, {
            id: '1',
            number: 1,
            url: 'https://hashbrown.dev',
          })
        }
      >
        Source
      </button>
    </article>
  ),
}));
import { PredictionsWorkbenchConversation } from '../examples/quickstart/react/src/PredictionsWorkbench';
import { SelectionWorkbenchConversation } from '../examples/quickstart/react/src/SelectionWorkbench';
import { MagicTextWorkbenchConversation } from '../examples/quickstart/react/src/MagicTextWorkbench';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const navigation = {
  currentId: '1',
  conversations: [{ id: '1', label: 'Plan' }],
  select: vi.fn(),
  create: vi.fn(),
};
function button(host: HTMLElement, text: string) {
  const result = [...host.querySelectorAll('button')].find(
    (node) =>
      node.textContent?.trim() === text ||
      node.getAttribute('aria-label') === text,
  );
  if (!result) throw new Error(`Missing button ${text}`);
  return result;
}
async function send(host: HTMLElement) {
  const composer = host.querySelector<HTMLTextAreaElement>('textarea');
  if (!composer) throw new Error('Missing composer');
  composer.value = 'Suggest the next action';
  await act(() =>
    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

test('predictions start idle and explicit completed context enables review, dismissal and one acceptance', async () => {
  window.history.replaceState(null, '', '?lesson=predictions');
  const idle = {
    output: null,
    error: undefined,
    isLoading: true,
    lastRunFinishReason: undefined,
    stop: vi.fn(),
  };
  sdk.completion.mockReturnValue(idle);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation active navigation={navigation} />,
    ),
  );
  expect(sdk.completion).not.toHaveBeenCalled();
  await send(host);
  const input = sdk.completion.mock.calls.at(-1)?.[0].input;
  expect(input.application.revision).toBe(0);
  expect(input.application.acceptedActions).toEqual([]);
  expect(host.textContent).not.toContain('Accept suggestion');
  sdk.completion.mockReturnValue({
    ...idle,
    isLoading: false,
    lastRunFinishReason: 'stop',
    output: {
      contextId: input.contextId,
      suggestions: [
        { actionId: 'record', reason: 'Ready to record' },
        { actionId: 'clarify', reason: 'Check progress' },
      ],
    },
  });
  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation
        active
        navigation={{ ...navigation }}
      />,
    ),
  );
  await act(() => button(host, 'Dismiss Clarify progress').click());
  expect(button(host, 'Accept Record the demo').disabled).toBe(false);
  await act(() => button(host, 'Accept Record the demo').click());

  expect(button(host, 'Accept Record the demo').disabled).toBe(true);
  expect(host.textContent).toContain('Ready to record');
  sdk.completion.mockReturnValue(idle);
  await send(host);
  const followup = sdk.completion.mock.calls.at(-1)?.[0].input;
  expect(followup.application.acceptedActions).toEqual(['record']);
  expect(host.textContent).toContain('Dismissed');
  sdk.completion.mockReturnValue({
    ...idle,
    isLoading: false,
    lastRunFinishReason: 'stop',
    output: {
      contextId: followup.contextId,
      suggestions: [
        { actionId: 'review', reason: 'The demo is recorded' },
        { actionId: 'clarify', reason: 'Confirm review progress' },
      ],
    },
  });
  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation
        active
        navigation={{ ...navigation }}
      />,
    ),
  );
  const clarify = [...host.querySelectorAll('section')].filter(
    (section) =>
      section.querySelector('h2')?.textContent === 'Clarify progress',
  );

  expect(clarify).toHaveLength(2);
  expect(clarify[0].textContent).toContain('Dismissed');
  expect(clarify[1].textContent).not.toContain('Dismissed');
  expect(clarify[1].querySelector('button')?.disabled).toBe(false);
  await act(() => root.unmount());
  host.remove();
});

test('selection offers manual choice before a request and never starts the SDK from rendering', async () => {
  window.history.replaceState(null, '', '?lesson=ui-selection');
  const host = document.createElement('div');
  const root = createRoot(host);

  await act(() =>
    root.render(
      <SelectionWorkbenchConversation active navigation={navigation} />,
    ),
  );
  await act(() => button(host, 'Show steps').click());

  expect(sdk.selection).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Application-owned plan');
  await act(() => root.unmount());
});

test('Magic Text retains captured SDK Markdown and citation selection is inert in history', async () => {
  window.history.replaceState(null, '', '?lesson=magic-text');
  const chat = {
    messages: [],
    lastAssistantMessage: undefined,
    isLoading: false,
    isResuming: false,
    lastRunFinishReason: undefined,
    error: undefined,
    pendingInterrupts: undefined,
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
    stop: vi.fn(),
  };
  sdk.chat.mockReturnValue(chat);
  const host = document.createElement('div');
  const root = createRoot(host);

  await act(() =>
    root.render(
      <MagicTextWorkbenchConversation active navigation={navigation} />,
    ),
  );
  expect(chat.sendMessage).not.toHaveBeenCalled();
  await send(host);
  const user = chat.sendMessage.mock.calls[0][0];
  const assistant = {
    id: 'native-answer',
    role: 'assistant',
    content: '# The plan [^1]',
  };
  sdk.chat.mockReturnValue({
    ...chat,
    messages: [user, assistant],
    lastAssistantMessage: assistant,
    lastRunFinishReason: 'stop',
  });
  await act(() =>
    root.render(
      <MagicTextWorkbenchConversation active navigation={{ ...navigation }} />,
    ),
  );
  await act(() => button(host, 'Source').click());
  expect(host.textContent).toContain('hashbrown.dev');
  await act(() => button(host, 'Previous event').click());
  const before = host.textContent;
  await act(() => button(host, 'Source').click());

  expect(host.textContent).toBe(before);
  expect(chat.sendMessage).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[data-caret=true]')).toBeNull();
  await act(() => root.unmount());
});

test('stale completion context, empty success, cancellation and explicit retry preserve application state', async () => {
  window.history.replaceState(null, '', '?lesson=predictions');
  const idle = {
    output: null,
    error: undefined,
    isLoading: true,
    lastRunFinishReason: undefined,
    stop: vi.fn(),
  };
  sdk.completion.mockReturnValue(idle);
  const host = document.createElement('div');
  const root = createRoot(host);

  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation active navigation={navigation} />,
    ),
  );
  await send(host);
  const firstInput = sdk.completion.mock.calls.at(-1)?.[0].input;
  sdk.completion.mockReturnValue({
    ...idle,
    isLoading: false,
    lastRunFinishReason: 'stop',
    output: {
      contextId: 'stale-context',
      suggestions: [{ actionId: 'record', reason: 'Ready' }],
    },
  });
  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation
        active
        navigation={{ ...navigation }}
      />,
    ),
  );
  expect(host.querySelector('[role=alert]')?.textContent).toContain(
    'did not match this context',
  );
  expect(host.textContent).not.toContain('Accept Record the demo');
  sdk.completion.mockReturnValue(idle);
  await send(host);
  const secondInput = sdk.completion.mock.calls.at(-1)?.[0].input;
  expect(secondInput.contextId).not.toBe(firstInput.contextId);
  expect(secondInput.application.revision).toBe(0);
  await act(() => button(host, 'Stop').click());
  sdk.completion.mockReturnValue({
    ...idle,
    isLoading: false,
    lastRunFinishReason: 'stop',
    output: {
      contextId: secondInput.contextId,
      suggestions: [{ actionId: 'record', reason: 'Late result' }],
    },
  });
  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation
        active
        navigation={{ ...navigation }}
      />,
    ),
  );
  expect(host.textContent).not.toContain('Late result');
  sdk.completion.mockReturnValue(idle);
  await send(host);
  const thirdInput = sdk.completion.mock.calls.at(-1)?.[0].input;
  sdk.completion.mockReturnValue({
    ...idle,
    isLoading: false,
    lastRunFinishReason: 'stop',
    output: { contextId: thirdInput.contextId, suggestions: [] },
  });
  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation
        active
        navigation={{ ...navigation }}
      />,
    ),
  );

  expect(host.textContent).toContain('No suggestions for this context.');
  expect(thirdInput.application.revision).toBe(0);
  await act(() => root.unmount());
});

test('selection uses the SDK preview and manual choice aborts a pending request before a late result', async () => {
  window.history.replaceState(null, '', '?lesson=ui-selection');
  const stop = vi.fn();
  const pending = {
    ids: [],
    ui: [],
    isLoading: true,
    error: undefined,
    decision: { value: null, meta: null, stop },
  };
  sdk.selection.mockReturnValue(pending);
  const host = document.createElement('div');
  const root = createRoot(host);

  await act(() =>
    root.render(
      <SelectionWorkbenchConversation active navigation={navigation} />,
    ),
  );
  await send(host);
  expect(sdk.selection.mock.calls.at(-1)?.[0].select).toBe('one');
  expect(sdk.selection.mock.calls.at(-1)?.[0].minConfidence).toBe(0.75);
  await act(() => button(host, 'Show steps').click());
  expect(stop).toHaveBeenCalledTimes(1);
  sdk.selection.mockReturnValue({
    ...pending,
    ids: ['summary'],
    ui: [<p key="preview">Actual SDK preview</p>],
    isLoading: false,
    decision: {
      value: { pick: 'summary' },
      meta: { pick: { confidence: 0.95 } },
      stop,
    },
  });
  await act(() =>
    root.render(
      <SelectionWorkbenchConversation active navigation={{ ...navigation }} />,
    ),
  );
  expect(host.textContent).not.toContain('Actual SDK preview');
  sdk.selection.mockReturnValue(pending);
  await send(host);
  const input = sdk.selection.mock.calls.at(-1)?.[0].input;
  expect(input.application.selectedView).toBe('steps');
  expect(input.application.revision).toBe(1);
  sdk.selection.mockReturnValue({
    ...pending,
    ids: ['summary'],
    ui: [<p key="preview">Actual SDK preview</p>],
    isLoading: false,
    decision: {
      value: { pick: 'summary' },
      meta: { pick: { confidence: 0.95 } },
      stop,
    },
  });
  await act(() =>
    root.render(
      <SelectionWorkbenchConversation active navigation={{ ...navigation }} />,
    ),
  );

  expect(
    host.querySelector(
      '[aria-label="UI selection result"] [aria-label="Selected view preview"]',
    )?.textContent,
  ).toContain('Actual SDK preview');
  expect(button(host, 'Use view').disabled).toBe(false);
  await act(() => button(host, 'Previous event').click());
  expect(host.textContent).not.toContain('Actual SDK preview');
  expect(button(host, 'Show steps').disabled).toBe(true);
  await act(() => root.unmount());
});

test('low-confidence selection exposes manual choice and never enables Use view', async () => {
  window.history.replaceState(null, '', '?lesson=ui-selection');
  const stop = vi.fn();
  sdk.selection.mockReturnValue({
    ids: [],
    ui: [],
    isLoading: false,
    error: undefined,
    decision: {
      value: { pick: 'summary' },
      meta: { pick: { confidence: 0.4 } },
      stop,
    },
  });
  const host = document.createElement('div');
  const root = createRoot(host);

  await act(() =>
    root.render(
      <SelectionWorkbenchConversation active navigation={navigation} />,
    ),
  );
  await send(host);

  expect(host.textContent).toContain('Low confidence. Choose a view manually.');
  expect(button(host, 'Use view').disabled).toBe(true);
  expect(button(host, 'Show summary').disabled).toBe(false);
  await act(() => root.unmount());
});

test('Magic Text preserves parser completion at a partial historical frame while hiding its caret', async () => {
  window.history.replaceState(null, '', '?lesson=magic-text');
  const chat = {
    messages: [],
    lastAssistantMessage: undefined,
    isLoading: false,
    isResuming: false,
    lastRunFinishReason: undefined,
    error: undefined,
    pendingInterrupts: undefined,
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
    stop: vi.fn(),
  };
  sdk.chat.mockReturnValue(chat);
  const host = document.createElement('div');
  const root = createRoot(host);

  await act(() =>
    root.render(
      <MagicTextWorkbenchConversation active navigation={navigation} />,
    ),
  );
  await send(host);
  const user = chat.sendMessage.mock.calls[0][0];
  const assistant = {
    id: 'native-answer',
    role: 'assistant',
    content: '# Partial **plan',
  };
  sdk.chat.mockReturnValue({
    ...chat,
    messages: [user, assistant],
    lastAssistantMessage: assistant,
    isLoading: true,
  });
  await act(() =>
    root.render(
      <MagicTextWorkbenchConversation active navigation={{ ...navigation }} />,
    ),
  );
  expect(
    host.querySelector('[data-final=false][data-caret=true]'),
  ).not.toBeNull();
  await act(() => button(host, 'Stop').click());
  expect(
    host.querySelector('[data-final=true][data-caret=false]'),
  ).not.toBeNull();
  await act(() => button(host, 'Previous event').click());

  expect(
    host.querySelector('[data-final=false][data-caret=false]'),
  ).not.toBeNull();
  expect(chat.sendMessage).toHaveBeenCalledTimes(1);
  await act(() => button(host, 'Next event').click());
  expect(
    host.querySelector('[data-final=true][data-caret=false]'),
  ).not.toBeNull();
  await act(() => root.unmount());
});

test('historical prediction notices follow the captured outcome across healthy retries and new errors', async () => {
  window.history.replaceState(null, '', '?lesson=predictions');
  const pending = {
    output: null,
    error: undefined,
    isLoading: true,
    lastRunFinishReason: undefined,
    stop: vi.fn(),
  };
  sdk.completion.mockReturnValue({
    ...pending,
    isLoading: false,
    error: new Error('First request failed'),
  });
  const host = document.createElement('div');
  const root = createRoot(host);

  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation active navigation={navigation} />,
    ),
  );
  await send(host);
  expect(host.querySelector('[data-live] [role=alert]')).not.toBeNull();
  sdk.completion.mockReturnValue(pending);
  await send(host);
  const input = sdk.completion.mock.calls.at(-1)?.[0].input;
  sdk.completion.mockReturnValue({
    ...pending,
    isLoading: false,
    lastRunFinishReason: 'stop',
    output: { contextId: input.contextId, suggestions: [] },
  });
  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation
        active
        navigation={{ ...navigation }}
      />,
    ),
  );
  expect(host.querySelector('[data-live] [role=alert]')).toBeNull();
  const requestsBeforeHistory = sdk.completion.mock.calls.length;
  for (let index = 0; index < 3; index++)
    await act(() => button(host, 'Previous event').click());

  expect(host.querySelector('[data-live] [role=alert]')?.textContent).toContain(
    'Suggestions failed',
  );
  expect(sdk.completion).toHaveBeenCalledTimes(requestsBeforeHistory);
  await act(() => button(host, 'Return to live').click());
  sdk.completion.mockReturnValue({
    ...pending,
    isLoading: false,
    error: new Error('Later request failed'),
  });
  await send(host);
  expect(host.querySelector('[data-live] [role=alert]')).not.toBeNull();
  const requestsBeforeHealthyHistory = sdk.completion.mock.calls.length;
  for (let index = 0; index < 2; index++)
    await act(() => button(host, 'Previous event').click());

  expect(host.textContent).toContain('No suggestions for this context.');
  expect(host.querySelector('[data-live] [role=alert]')).toBeNull();
  expect(sdk.completion).toHaveBeenCalledTimes(requestsBeforeHealthyHistory);
  await act(() => root.unmount());
});

test('prediction acceptance labels belong to the used proposal and previously accepted actions stay disabled', async () => {
  window.history.replaceState(null, '', '?lesson=predictions');
  const pending = {
    output: null,
    error: undefined,
    isLoading: true,
    lastRunFinishReason: undefined,
    stop: vi.fn(),
  };
  sdk.completion.mockReturnValue(pending);
  const host = document.createElement('div');
  const root = createRoot(host);
  const recordCards = () =>
    [...host.querySelectorAll('section')].filter(
      (section) =>
        section.querySelector(':scope > h2')?.textContent === 'Record the demo',
    );
  const labels = (section: HTMLElement) =>
    [...section.querySelectorAll('p')].map((node) => node.textContent);

  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation active navigation={navigation} />,
    ),
  );
  for (const reason of ['First proposal', 'Fresh proposal']) {
    sdk.completion.mockReturnValue(pending);
    await send(host);
    const input = sdk.completion.mock.calls.at(-1)?.[0].input;
    sdk.completion.mockReturnValue({
      ...pending,
      isLoading: false,
      lastRunFinishReason: 'stop',
      output: {
        contextId: input.contextId,
        suggestions: [{ actionId: 'record', reason }],
      },
    });
    await act(() =>
      root.render(
        <PredictionsWorkbenchConversation
          active
          navigation={{ ...navigation }}
        />,
      ),
    );
    if (reason === 'First proposal')
      await act(() => button(host, 'Dismiss Record the demo').click());
    else await act(() => recordCards()[1].querySelector('button')?.click());
  }

  expect(labels(recordCards()[0])).toEqual(['First proposal', 'Dismissed']);
  expect(labels(recordCards()[1])).toEqual(['Fresh proposal', 'Accepted']);
  sdk.completion.mockReturnValue(pending);
  await send(host);
  const latest = sdk.completion.mock.calls.at(-1)?.[0].input;
  expect(latest.application.acceptedActions).toEqual(['record']);
  sdk.completion.mockReturnValue({
    ...pending,
    isLoading: false,
    lastRunFinishReason: 'stop',
    output: {
      contextId: latest.contextId,
      suggestions: [{ actionId: 'record', reason: 'Already accepted action' }],
    },
  });
  await act(() =>
    root.render(
      <PredictionsWorkbenchConversation
        active
        navigation={{ ...navigation }}
      />,
    ),
  );

  expect(labels(recordCards()[2])).toEqual(['Already accepted action']);
  expect(recordCards()[2].querySelector('button')?.disabled).toBe(true);
  await act(() => root.unmount());
});
