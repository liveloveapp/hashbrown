import { useState } from 'react';
import { readCandidateConfiguration } from './candidate-runtime';
import { ChatLeaf } from './react/chat';
import { StructuredChatLeaf } from './react/structured-chat';
import { CompletionLeaf } from './react/completion';
import { StructuredCompletionLeaf } from './react/structured-completion';
import { UiChatLeaf } from './react/ui-chat';
import { UiCompletionLeaf } from './react/ui-completion';

/** Selects one mounted public facade without conditional hook calls. */
export function App() {
  const [config] = useState(readCandidateConfiguration);
  switch (config.facade) {
    case 'chat':
      return <ChatLeaf config={config} />;
    case 'structured-chat':
      return <StructuredChatLeaf config={config} />;
    case 'completion':
      return <CompletionLeaf config={config} />;
    case 'structured-completion':
      return <StructuredCompletionLeaf config={config} />;
    case 'ui-chat':
      return <UiChatLeaf config={config} />;
    case 'ui-completion':
      return <UiCompletionLeaf config={config} />;
  }
}
