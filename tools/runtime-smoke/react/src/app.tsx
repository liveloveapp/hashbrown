import { PlainSmoke } from './plain-smoke';

type Scenario = 'plain' | 'tool' | 'structured' | 'ui';

function readScenario(): Scenario {
  const scenario = new URL(globalThis.location.href).searchParams.get(
    'scenario',
  );

  return scenario === 'tool' || scenario === 'structured' || scenario === 'ui'
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
      ) : (
        <>Scenario: {scenario}</>
      )}
    </main>
  );
}
