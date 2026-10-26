// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PlanCard } from '../examples/quickstart/react/src/PlanCard';
import {
  Session,
  SummaryCard,
} from '../examples/quickstart/react/src/Workbench';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';

const source = (name: string) =>
  readFileSync(resolve(process.cwd(), 'www/examples/quickstart', name), 'utf8');

test('renders a pure partial plan with escaped text and no acceptance action', () => {
  const html = renderToStaticMarkup(
    <PlanCard title="<script>" steps={['Outline the demo']} />,
  );

  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('Outline the demo');
  expect(html).not.toContain('<button');
});

test('minimal first plan clients expose only the shared plan and retain standalone imports', () => {
  for (const name of [
    'react/src/FirstPlanApp.tsx',
    'angular/src/app/first-plan-app.ts',
  ]) {
    const text = source(name);

    expect(text).toContain('PlanCard');
    expect(text).toContain("name: 'SummaryCard'");
    expect(text).toContain('s.streaming.array');
    expect(text).toContain('children: false');
    expect(text).not.toContain('/runtime/');
    expect(text).not.toContain('tools:');
  }
});

test('minimal conversation clients teach a named plan and its follow-up with real chat APIs', () => {
  for (const [name, api] of [
    ['react/src/ConversationBasics.tsx', 'useChat'],
    ['angular/src/app/conversation-basics.ts', 'chatResource'],
  ]) {
    const text = source(name);

    expect(text).toContain(api);
    expect(text).toContain('Lighthouse');
    expect(text).toContain('What did I name my plan, and what comes next?');
    expect(text).not.toContain('/runtime/');
  }
});

test('workbench UI selects the standalone shared registration for the bounded first-plan lesson', () => {
  for (const name of [
    'react/src/Workbench.tsx',
    'angular/src/app/workbench.ts',
  ]) {
    const text = source(name);

    expect(text).toContain('firstPlanComponents');
    expect(text).toContain('workbenchFirstPlanSystem');
    expect(text).toContain("'first-plan'");
  }
});

test('text lifecycle distinguishes plain onboarding from the Magic Text citation lesson', () => {
  for (const name of [
    'react/src/MagicTextWorkbench.tsx',
    'angular/src/app/magic-text-workbench.ts',
  ]) {
    const text = source(name);

    expect(text).toContain('workbenchBrowserInstructions');
    expect(text).toContain('workbenchConversationSystem');
    expect(text).toContain('Plain text response');
  }
});

test('structured application cards preserve their application-owned label', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const store = createWorkbenchStore();
  const host = document.createElement('div');
  const root = createRoot(host);

  await act(() =>
    root.render(
      <Session.Provider value={store}>
        <SummaryCard
          title="Demo"
          steps={['Outline', 'Record']}
          format="structured"
        />
      </Session.Provider>,
    ),
  );
  const text = host.textContent;
  await act(() => root.unmount());

  expect(text).toContain('Typed plan · application component');
  expect(text).not.toContain('SummaryCard · trusted component');
});
