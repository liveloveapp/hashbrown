import { CompletionSmoke } from './completion-smoke';
import { PlainSmoke } from './plain-smoke';
import { StructuredSmoke } from './structured-smoke';
import { UiSmoke } from './ui-smoke';

type Scenario = 'plain' | 'tool' | 'structured' | 'ui' | 'completion';

function readScenario(): Scenario {
  const scenario = new URL(globalThis.location.href).searchParams.get(
    'scenario',
  );

  return scenario === 'tool' ||
    scenario === 'structured' ||
    scenario === 'ui' ||
    scenario === 'completion'
    ? scenario
    : 'plain';
}

/** Minimal React fixture shell selected by the scenario query parameter. */
export function App() {
  const scenario = readScenario();

  return (
    <main data-testid="fixture-ready">
      {scenario === 'plain' || scenario === 'tool' ? (
        <PlainSmoke scenario={scenario} />
      ) : scenario === 'structured' ? (
        <StructuredSmoke />
      ) : scenario === 'completion' ? (
        <CompletionSmoke />
      ) : (
        <UiSmoke />
      )}
    </main>
  );
}
