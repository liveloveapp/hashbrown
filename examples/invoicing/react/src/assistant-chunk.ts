import { type ComponentType, createElement } from 'react';
import type { AssistantWorkspaceProps } from './assistant-workspace';

/** The shape `React.lazy` expects: the assistant workspace as a default export. */
export interface AssistantChunk {
  readonly default: ComponentType<AssistantWorkspaceProps>;
}

function AssistantUnavailable() {
  return createElement(
    'p',
    { className: 'connection-notice' },
    "The assistant couldn't load. Reload the page to try again.",
  );
}

/**
 * Loads the assistant's code-split chunk for `React.lazy`. A failed import
 * (a dropped connection, a deploy that removed the old chunk) resolves to a
 * notice in the rail instead of rejecting, so the dashboard keeps working.
 *
 * @param importer - Starts the dynamic import, e.g. `() => import('./assistant-workspace')`.
 * @returns The workspace, or a notice asking the user to reload.
 */
export function loadAssistantWorkspace(
  importer: () => Promise<{
    readonly AssistantWorkspace: ComponentType<AssistantWorkspaceProps>;
  }>,
): Promise<AssistantChunk> {
  return importer().then(
    (module) => ({ default: module.AssistantWorkspace }),
    () => ({ default: AssistantUnavailable }),
  );
}
