import {
  type ComponentFallbackProps,
  type JsonResolvedValue,
  s,
  type UiComponentDefinition,
} from '@hashbrownai/core';
import { exposeComponent, useTool, useUiChat } from '@hashbrownai/react';
import { Fragment, type ReactNode, useState } from 'react';
import { createWorkflow, type WorkflowSnapshot } from './workflow';

/** Trusted leaf contract for this local native UI workflow host. */
const workflowStatusDefinition = {
  name: 'status',
  description: 'Display a runtime status.',
  props: {
    title: s.streaming.string('Status title'),
    count: s.number('Status count'),
  },
  children: false,
} satisfies UiComponentDefinition;

/** Container contract; only status components are allowed as children. */
const workflowPanelDefinition = {
  name: 'panel',
  description: 'Group a status inside a panel.',
  props: { heading: s.string('Panel heading') },
  children: [workflowStatusDefinition],
} satisfies UiComponentDefinition;

interface RuntimeStatusProps {
  readonly title: string;
  readonly count: number;
}

function RuntimeStatus({ title, count }: RuntimeStatusProps) {
  return (
    <section data-testid="ui-leaf">
      <span data-testid="ui-value">{title}</span>
      <span data-testid="ui-count">{count}</span>
    </section>
  );
}

function partialTitle(
  partialProps: Record<string, JsonResolvedValue> | undefined,
): string {
  const title = partialProps?.['title'];

  return typeof title === 'string' ? title : '';
}

function RuntimeStatusFallback({ partialProps }: ComponentFallbackProps) {
  return <div data-testid="ui-fallback">{partialTitle(partialProps)}</div>;
}

/** Container used only by the opt-in nested UI scenario. */
function RuntimePanel({
  heading,
  children,
}: {
  heading: string;
  children?: ReactNode;
}) {
  return (
    <section data-testid="ui-panel">
      <h2>{heading}</h2>
      {children}
    </section>
  );
}

const statusComponent = exposeComponent(RuntimeStatus, {
  ...workflowStatusDefinition,
  fallback: RuntimeStatusFallback,
});
const panelComponent = exposeComponent(RuntimePanel, {
  ...workflowPanelDefinition,
  children: [statusComponent],
});

type UiWorkflow = 'lookup' | 'dependent' | 'nested' | 'no-tools' | 'broad';

/** Selects bounded declarations, with an explicit broad catalog for local research. */
function readUiWorkflow(): UiWorkflow {
  const parameters = new URL(globalThis.location.href).searchParams;
  const workflow = parameters.get('uiWorkflow');
  if (
    workflow === 'lookup' ||
    workflow === 'dependent' ||
    workflow === 'nested' ||
    workflow === 'no-tools' ||
    workflow === 'broad'
  )
    return workflow;
  return parameters.get('noTools') === 'true' ? 'no-tools' : 'lookup';
}

/** Exercises native tools and trusted component UI through the real React runtime. */
export function LocalUiWorkflow() {
  const configuration = readUiWorkflow();
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
  const chat = useUiChat({
    system:
      'Call only declared tools explicitly requested by the user. status and panel are JSON output components, never callable tools. When only lookup_secret is requested, call it exactly once and do not call follow_secret. Call follow_secret only when explicitly requested, using the exact token from lookup_secret. Complete the requested steps before rendering UI. Never guess unknown tokens or receipts. Render status components using the exact requested token or receipt as title and requested count. A panel may contain only status children. Without tools render the requested literal title.',
    components:
      configuration === 'nested' || configuration === 'broad'
        ? [statusComponent, panelComponent]
        : [statusComponent],
    tools:
      configuration === 'no-tools'
        ? []
        : configuration === 'dependent' || configuration === 'broad'
          ? [lookup, follow]
          : [lookup],
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
      <button
        data-testid="stop"
        type="button"
        onClick={() => {
          if (chat.isLoading) chat.stop();
        }}
      >
        Stop
      </button>
      <div data-testid="operation-count">{snapshot.operations.length}</div>
      <div data-testid="operations">{JSON.stringify(snapshot.operations)}</div>
      <div data-testid="status">{chat.isLoading ? 'loading' : 'idle'}</div>
      {chat.messages.map((message, index) =>
        message.role === 'assistant' ? (
          <Fragment key={index}>{message.ui}</Fragment>
        ) : null,
      )}
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
