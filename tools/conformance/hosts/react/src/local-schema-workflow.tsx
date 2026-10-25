import { s } from '@hashbrownai/core';
import { useStructuredChat, useTool } from '@hashbrownai/react';
import { useState } from 'react';
import { createWorkflow, type WorkflowSnapshot } from './workflow';

/** Exercises native tools and parsed schema output through the real React runtime. */
export function LocalSchemaWorkflow() {
  const [prompt, setPrompt] = useState('');
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>({
    operations: [],
    pending: false,
  });
  const [workflow] = useState(() => createWorkflow(setSnapshot));
  const lookup = useTool({
    name: 'lookup_secret',
    description:
      'Look up the exact unknown secret token for alpha. Never guess it.',
    schema: s.object('Lookup', { record: s.string('Record identifier') }),
    handler: workflow.lookup,
    deps: [workflow],
  });
  const follow = useTool({
    name: 'follow_secret',
    description: 'Use the exact token from lookup_secret to obtain a receipt.',
    schema: s.object('Dependent lookup', {
      token: s.string('Exact lookup token'),
    }),
    handler: workflow.follow,
    deps: [workflow],
  });
  const chat = useStructuredChat({
    system:
      'Follow the requested workflow. Obtain unknown tokens and receipts using tools; never guess. Complete all requested tool steps before answering. Return only a JSON object with a value property containing the exact requested token or receipt.',
    schema: s.object('Final answer', {
      value: s.string('Exact requested tool result'),
    }),
    tools: [lookup, follow],
  });
  return (
    <section>
      <input
        data-testid="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <button
        data-testid="send"
        type="button"
        onClick={() => chat.sendMessage({ role: 'user', content: prompt })}
      >
        Send
      </button>
      <button data-testid="stop" type="button" onClick={() => chat.stop()}>
        Stop
      </button>
      <div data-testid="operation-count">{snapshot.operations.length}</div>
      <div data-testid="operations">{JSON.stringify(snapshot.operations)}</div>
      <div data-testid="status">{chat.isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="assistant">
        {chat.lastAssistantMessage?.content
          ? JSON.stringify(chat.lastAssistantMessage.content)
          : ''}
      </div>
      <div data-testid="history">{JSON.stringify(chat.messages)}</div>
      <div data-testid="error">
        {chat.error instanceof Error
          ? chat.error.message
          : chat.error === undefined
            ? ''
            : String(chat.error)}
      </div>
    </section>
  );
}
