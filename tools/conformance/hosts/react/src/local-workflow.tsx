import { s } from '@hashbrownai/core';
import { useChat, useTool } from '@hashbrownai/react';
import { useState } from 'react';
import { createWorkflow, type WorkflowSnapshot } from './workflow';

/** Opt-in real framework tool workflow; permission decisions belong to the application. */
export function LocalWorkflow() {
  const [prompt, setPrompt] = useState('');
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>({
    operations: [],
    pending: false,
  });
  const [workflow] = useState(() => createWorkflow(setSnapshot));
  const lookup = useTool({
    name: 'lookup_secret',
    description:
      'Look up the exact secret token for alpha or beta. Never guess.',
    schema: s.object('Secret lookup', {
      record: s.enumeration('Record', {
        alpha: 'Alpha record',
        beta: 'Beta record',
      }),
    }),
    handler: workflow.lookup,
    deps: [workflow],
  });
  const follow = useTool({
    name: 'follow_secret',
    description: 'Use the exact lookup_secret token to obtain a receipt.',
    schema: s.object('Dependent lookup', {
      token: s.string('The exact token returned by lookup_secret'),
    }),
    handler: workflow.follow,
    deps: [workflow],
  });
  const protectedLookup = useTool({
    name: 'protected_lookup',
    description:
      'Look up a secret after the application asks for permission. If denied, do not retry.',
    schema: s.object('Protected lookup', {
      record: s.enumeration('Record', {
        alpha: 'Alpha record',
        beta: 'Beta record',
      }),
    }),
    handler: workflow.protectedLookup,
    deps: [workflow],
  });
  const chat = useChat({
    system:
      new URL(globalThis.location.href).searchParams.get('localModel') ===
      'chrome-tools'
        ? 'Follow the requested workflow. Use tools to obtain unknown tokens or receipts; never guess. When asked for a token or receipt, return exactly that JSON property string value from the tool result. Return no JSON objects, code fences, quotes, explanations, or other text. If permission is denied, do not retry; return exactly HB_PERMISSION_DENIED. For requests explicitly requiring no tools, answer with text only.'
        : 'Execute the requested workflow using tools. Return only actual tool results; never guess secret tokens or receipts. Do not retry denied operations.',
    tools: [lookup, follow, protectedLookup],
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
      <p>Application-owned tool permission</p>
      <button
        data-testid="permission-allow"
        type="button"
        disabled={!snapshot.pending}
        onClick={() => workflow.decide(true)}
      >
        Allow
      </button>
      <button
        data-testid="permission-deny"
        type="button"
        disabled={!snapshot.pending}
        onClick={() => workflow.decide(false)}
      >
        Deny
      </button>
      <div data-testid="permission-pending">{String(snapshot.pending)}</div>
      <div data-testid="operation-count">{snapshot.operations.length}</div>
      <div data-testid="operations">{JSON.stringify(snapshot.operations)}</div>
      <div data-testid="status">{chat.isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="assistant">
        {chat.lastAssistantMessage?.content ?? ''}
      </div>
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
