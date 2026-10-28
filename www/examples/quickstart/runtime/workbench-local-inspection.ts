import type { WorkbenchSnapshot } from './workbench';

/** Projects immutable preparation observations without checking or creating a native model. */
export function workbenchLocalInspection(
  tab: string,
  snapshot: WorkbenchSnapshot,
  lesson?: string,
) {
  if (lesson !== 'local-models') return undefined;
  const visible = snapshot.events.slice(
    0,
    (snapshot.cursor ?? snapshot.events.length - 1) + 1,
  );
  const native = [...visible]
    .reverse()
    .find(
      (event) =>
        event.turn === (snapshot.frame?.turn ?? snapshot.turn) &&
        event.kind === 'source' &&
        event.payload &&
        typeof event.payload === 'object' &&
        'native' in event.payload,
    )?.payload;
  if (tab === 'Model')
    return {
      heading: 'Browser-local model',
      value: {
        preparation: snapshot.frame?.localModel ?? { state: 'idle' },
        transportMetadata:
          native && typeof native === 'object' && 'native' in native
            ? native.native
            : null,
      },
      detailHeading: 'Preparation and inference',
      detail: {
        transport: 'experimental_chrome',
        outputLanguage: 'en',
        tools: [],
        preparation:
          'Prepare model is explicit. Inference refuses an implicit download.',
        completion:
          'The SDK emits its terminal event after native stream EOF. Original JSON and application rules are checked separately.',
        note: 'No hosted model request or automatic cloud fallback. Downloads, application assets and telemetry have separate network behavior.',
      },
    };
  if (tab === 'UI')
    return {
      heading: 'Application-rendered local proposal',
      value: {
        props: snapshot.frame?.props ?? null,
        sourceStatus: snapshot.frame?.status ?? snapshot.status,
      },
      detailHeading: 'Explicit application acceptance',
      detail: {
        application: snapshot.frame?.application ?? snapshot.application,
        note: 'A preview does not apply state. Accept requires successful current native completion, valid original JSON, matching parsed fields and current revision. Replay uses captured values only.',
      },
    };
  return undefined;
}
