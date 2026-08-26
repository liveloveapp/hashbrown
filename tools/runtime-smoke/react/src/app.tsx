/** Minimal React fixture shell selected by the scenario query parameter. */
export function App() {
  const scenario =
    new URL(globalThis.location.href).searchParams.get('scenario') || 'plain';

  return <main data-testid="fixture-ready">Scenario: {scenario}</main>;
}
