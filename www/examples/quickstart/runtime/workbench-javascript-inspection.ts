import type { WorkbenchSnapshot } from './workbench';

/** Projects captured QuickJS values without loading a runtime or evaluating code. */
export function workbenchJavaScriptInspection(
  tab: string,
  snapshot: WorkbenchSnapshot,
  lesson?: string,
) {
  if (lesson !== 'javascript-runtime') return undefined;
  const execution = snapshot.frame?.javascript;
  if (tab === 'Code')
    return {
      heading: 'Submitted JavaScript',
      value: execution?.code ?? 'Run a script to capture its source.',
      detailHeading: 'Explicit host capability',
      detail: {
        functions: ['readPlan({ revision })'],
        freshContext: true,
        note: 'Application-owned script, executed by real QuickJS. No model or provider request. Host arguments are checked by the handler.',
      },
    };
  if (tab === 'Runtime')
    return {
      heading: 'QuickJS execution',
      value: execution
        ? {
            status: execution.status,
            outcome: execution.outcome ?? null,
            calls: execution.calls,
            runId: execution.runId,
          }
        : 'Waiting for an explicit Run action.',
      detailHeading: 'Execution and application boundaries',
      detail: {
        timeoutMs: 1000,
        state: snapshot.frame?.application ?? snapshot.application,
        note: 'Read-only host capability. A result does not apply a plan. The deadline can interrupt script loops; it does not roll back arbitrary host effects or impose a memory limit.',
      },
    };
  if (tab === 'UI')
    return {
      heading: 'Application-rendered runtime result',
      value: {
        renderer: 'Plain result or error',
        modelGenerated: false,
        outcome: execution?.outcome ?? null,
      },
      detailHeading: 'Read-only playback',
      detail: {
        note: 'Captured values only. Replay invokes no scripts, host functions, model requests or application writes.',
      },
    };
  return undefined;
}
