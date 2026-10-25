import { LocalMedia } from './local-media';
import { LocalWorkflow } from './local-workflow';
import { LocalSchemaWorkflow } from './local-schema-workflow';
import { CompletionSmoke } from './completion-smoke';
import { DecisionSmoke } from './decision-smoke';
import { PlainSmoke } from './plain-smoke';
import { StructuredSmoke } from './structured-smoke';
import { UiSmoke } from './ui-smoke';

type Scenario =
  'plain' | 'tool' | 'structured' | 'ui' | 'completion' | 'decision';

function readScenario(): Scenario {
  const scenario = new URL(globalThis.location.href).searchParams.get(
    'scenario',
  );

  return scenario === 'tool' ||
    scenario === 'structured' ||
    scenario === 'ui' ||
    scenario === 'completion' ||
    scenario === 'decision'
    ? scenario
    : 'plain';
}

/** Minimal React fixture shell selected by the scenario query parameter. */
export function App() {
  const scenario = readScenario();
  const localWorkflow =
    new URL(globalThis.location.href).searchParams.get('localWorkflow') ===
    'true';

  const localMedia = new URL(globalThis.location.href).searchParams.get(
    'localMedia',
  );
  const localSchemaWorkflow =
    new URL(globalThis.location.href).searchParams.get(
      'localSchemaWorkflow',
    ) === 'true';

  return (
    <main data-testid="fixture-ready">
      {localMedia === 'image' || localMedia === 'audio' ? (
        <LocalMedia />
      ) : localSchemaWorkflow ? (
        <LocalSchemaWorkflow />
      ) : localWorkflow ? (
        <LocalWorkflow />
      ) : scenario === 'plain' || scenario === 'tool' ? (
        <PlainSmoke scenario={scenario} />
      ) : scenario === 'structured' ? (
        <StructuredSmoke />
      ) : scenario === 'completion' ? (
        <CompletionSmoke />
      ) : scenario === 'decision' ? (
        <DecisionSmoke />
      ) : (
        <UiSmoke />
      )}
    </main>
  );
}
