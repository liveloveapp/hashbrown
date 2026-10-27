import type { WorkbenchSnapshot } from './workbench';
import { getWorkbenchUiResponseSchema } from './workbench-ui-kits';

/** Projects captured framework kit configuration and selected UI without rerunning a renderer. */
export function workbenchUiInspection(
  tab: string,
  snapshot: WorkbenchSnapshot,
  lesson?: string,
) {
  if (lesson !== 'ui-kits' && lesson !== 'ui-chatbot') return undefined;
  const frame = snapshot.frame;
  const kit = frame?.uiKit;
  if (tab === 'Kit') {
    return {
      heading: 'Actual normalized framework kit',
      value: kit
        ? { components: kit.components }
        : 'Waiting for kit configuration',
      detailHeading: 'Configuration and rendering boundary',
      detail: {
        source: 'Framework kit registry',
        fallback:
          'Registry metadata records configured fallbacks, not whether one is currently rendered.',
        note: 'Only safe name, description and fallback metadata is captured. Component implementations stay in application code.',
      },
    };
  }
  if (tab === 'Schema') {
    let schema: unknown = 'Waiting for actual kit schema';
    if (kit) {
      try {
        schema = JSON.parse(kit.serializedSchema);
      } catch {
        schema = kit.serializedSchema;
      }
    }
    return {
      heading: 'Actual serialized framework kit schema',
      value: schema,
      detailHeading: 'Server-owned response policy',
      detail: {
        schema: getWorkbenchUiResponseSchema(lesson),
        note: 'The server pins the trusted wrapper. Acceptance also validates the original document and current application revision.',
      },
    };
  }
  if (tab === 'UI') {
    const component = frame?.uiComponent ?? null;
    return {
      heading: 'Selected trusted component',
      value: {
        component,
        props: frame?.props ?? null,
        sourceStatus: frame?.status ?? snapshot.status,
        acceptanceAction:
          component === 'SummaryCard' || component === 'StepsCard',
      },
      detailHeading: 'Application state and component responsibility',
      detail: {
        application: frame?.application ?? snapshot.application,
        note:
          component === 'PlanReading'
            ? 'Read-only model report. State is authoritative; this component cannot accept a plan.'
            : 'A rendered proposal does not apply state. Only a fresh completed valid proposal can be accepted explicitly.',
      },
    };
  }
  return undefined;
}
