import { PlainSmoke } from './plain-smoke';
import { StructuredSmoke } from './structured-smoke';
import { UiSmoke } from './ui-smoke';
/** Selects the cloud qualification scenario. */
export function App() {
  const value = new URL(location.href).searchParams.get('scenario');
  const scenario =
    value === 'tool' || value === 'structured' || value === 'ui'
      ? value
      : 'plain';
  return (
    <main data-testid="fixture-ready">
      {scenario === 'plain' || scenario === 'tool' ? (
        <PlainSmoke scenario={scenario} />
      ) : scenario === 'structured' ? (
        <StructuredSmoke />
      ) : (
        <UiSmoke />
      )}
    </main>
  );
}
