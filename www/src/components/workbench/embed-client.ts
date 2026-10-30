// Type-only: the runtime protocol module imports @hashbrownai/core.
import type {
  WorkbenchChildMessage,
  WorkbenchParentMessage,
} from '../../../examples/quickstart/runtime/workbench-messages';

type ChildMessageOf<T extends WorkbenchChildMessage['type']> = Extract<
  WorkbenchChildMessage,
  { type: T }
>;

/** Callbacks for each message an embedded workbench sends. */
export interface EmbedClientHandlers {
  ready(message: ChildMessageOf<'hb-workbench:ready'>): void;
  loaded(message: ChildMessageOf<'hb-workbench:loaded'>): void;
  rejected(message: ChildMessageOf<'hb-workbench:rejected'>): void;
  state(message: ChildMessageOf<'hb-workbench:state'>): void;
}

/** A connection to one embedded workbench frame. */
export interface EmbedClient {
  /** Posts to the frame, at the workbench origin only. */
  post(message: WorkbenchParentMessage): void;
  dispose(): void;
}

const handlerNames = {
  'hb-workbench:ready': 'ready',
  'hb-workbench:loaded': 'loaded',
  'hb-workbench:rejected': 'rejected',
  'hb-workbench:state': 'state',
} as const;

/**
 * Talks to an embedded workbench. Messages count only when they come from
 * `frame`'s window at `origin` and carry a known type and version 1.
 *
 * @param frame - The workbench iframe.
 * @param origin - The workbench origin.
 * @param handlers - Called per child message type.
 */
export function createEmbedClient(
  frame: HTMLIFrameElement,
  origin: string,
  handlers: EmbedClientHandlers,
): EmbedClient {
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== frame.contentWindow) return;
    const data: unknown = event.data;
    if (typeof data !== 'object' || data === null) return;
    const { type, version } = data as { type?: unknown; version?: unknown };
    if (version !== 1 || typeof type !== 'string') return;
    if (!Object.hasOwn(handlerNames, type)) return;
    const name = handlerNames[type as keyof typeof handlerNames];
    (handlers[name] as (message: WorkbenchChildMessage) => void)(
      data as WorkbenchChildMessage,
    );
  };
  window.addEventListener('message', onMessage);
  return {
    post: (message) => frame.contentWindow?.postMessage(message, origin),
    dispose: () => window.removeEventListener('message', onMessage),
  };
}
