import type { WorkbenchServerHistoryState } from './workbench-server-history';

/** Projects only the selected captured server snapshot; rendering never performs HTTP work. */
export function workbenchServerInspection(
  tab: string,
  server: WorkbenchServerHistoryState | undefined,
) {
  if (!['Server', 'Access'].includes(tab)) return undefined;
  return tab === 'Server'
    ? {
        heading: 'Last loaded or saved server snapshot',
        value: {
          selectedSlot: server?.selectedSlot ?? 'Lighthouse',
          threadId: server?.threadId ?? null,
          version: server?.version ?? null,
          snapshot: server?.snapshot ?? null,
        },
        detailHeading: 'HTTP operations and application state',
        detail: {
          latestOperation: server?.operations.at(-1) ?? null,
          operations: server?.operations ?? [],
          busy: server?.busy ?? false,
          error: server?.error ?? null,
          note: 'Completed text only. Process-local demo storage survives browser refresh, not server restart.',
        },
      }
    : {
        heading: 'Captured access checks',
        value: {
          access: server?.access ?? 'unknown',
          latestOperation: server?.operations.at(-1) ?? null,
          checks:
            server?.operations.map(({ action, status }) => ({
              action,
              status,
            })) ?? [],
        },
        detailHeading: 'Application authorization boundary',
        detail: {
          operations: [...(server?.operations ?? [])].reverse(),
          selectedSlot: server?.selectedSlot ?? 'Lighthouse',
          threadId: server?.threadId ?? null,
          error: server?.error ?? null,
          note: 'Local demo session. Server identity, Origin, input, ownership and admission checks precede provider work.',
        },
      };
}
