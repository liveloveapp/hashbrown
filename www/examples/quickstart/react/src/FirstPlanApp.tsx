import { Fragment } from 'react';
import { s } from '@hashbrownai/core';
import { exposeComponent, useUiChat } from '@hashbrownai/react';
import { PlanCard } from './PlanCard';

/** The only UI the model may render: validated title and streaming steps. */
export const firstPlanComponents = [
  exposeComponent(PlanCard, {
    name: 'SummaryCard',
    description: 'Show a concise two-step plan as a preview.',
    props: {
      title: s.string('A concise plan title'),
      steps: s.streaming.array(
        'The ordered plan steps',
        s.string('A concise action'),
      ),
    },
    children: false,
  }),
];

/** Generates a plan using the application-owned component and schema. */
export function FirstPlanApp() {
  const chat = useUiChat({
    system:
      'Help a developer create a small two-step plan for a trusted UI demo. Render exactly one SummaryCard with a short title and exactly two concise steps: outline the demo, then record it. Do not call tools. Rendering is a preview and does not change application state.',
    components: firstPlanComponents,
  });
  return (
    <main>
      <h1>Your first generated plan</h1>
      <button
        type="button"
        disabled={chat.isLoading}
        onClick={() =>
          chat.sendMessage({
            role: 'user',
            content: 'Create a two-step plan for a trusted UI demo.',
          })
        }
      >
        Generate a plan
      </button>
      {chat.isLoading && <p role="status">Creating your plan…</p>}
      {chat.error && <p role="alert">Check your server, then try again.</p>}
      {chat.messages.map((message, index) =>
        message.role === 'assistant' ? (
          <Fragment key={index}>{message.ui}</Fragment>
        ) : null,
      )}
    </main>
  );
}
