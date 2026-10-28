import { experimental_chrome, type Transport } from '@hashbrownai/core';
import type { WorkbenchStore } from './workbench';
import { createWorkbenchTransport } from './workbench-transport';

/** Bounded preparation facts; native model and session objects are never captured. */
export interface WorkbenchLocalModelObservation {
  readonly operationId: string;
  readonly state: 'idle' | 'preparing' | 'ready' | 'error' | 'cancelled';
  readonly progress?: number;
  readonly issue?: string;
}

/** Fixed tool-free instructions for local structured plan proposals. */
export const workbenchLocalModelSystem =
  'Create a small two-step plan for a developer. Return only a JSON object with a short title and exactly two concise string steps. The first request should create outline and record steps. Read the explicit current application context included below. For a follow-up requesting a shorter second step, retain the accepted title and first step verbatim and shorten only the second step. Returning a proposal does not apply state; only explicit user acceptance changes the application. Do not claim application state changed.';

/** Validates and detaches only explicitly allowlisted preparation values. */
export function normalizeWorkbenchLocalModelObservation(
  input: unknown,
): WorkbenchLocalModelObservation | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Object.keys(descriptors);
  if (
    keys.some(
      (key) =>
        !['operationId', 'state', 'progress', 'issue'].includes(key) ||
        !('value' in descriptors[key]),
    )
  )
    return null;
  const value = Object.fromEntries(
    keys.map((key) => [key, descriptors[key].value]),
  );
  if (
    typeof value['operationId'] !== 'string' ||
    !value['operationId'].trim() ||
    value['operationId'].length > 160 ||
    typeof value['state'] !== 'string' ||
    !['idle', 'preparing', 'ready', 'error', 'cancelled'].includes(
      value['state'],
    ) ||
    (value['progress'] !== undefined &&
      (typeof value['progress'] !== 'number' ||
        !Number.isFinite(value['progress']) ||
        value['progress'] < 0 ||
        value['progress'] > 100)) ||
    (value['issue'] !== undefined &&
      (typeof value['issue'] !== 'string' || value['issue'].length > 2000))
  )
    return null;
  return Object.freeze({
    operationId: value['operationId'],
    state: value['state'] as WorkbenchLocalModelObservation['state'],
    ...(typeof value['progress'] === 'number'
      ? { progress: value['progress'] }
      : {}),
    ...(typeof value['issue'] === 'string' ? { issue: value['issue'] } : {}),
  });
}

function captureLocalMetadata(
  input: unknown,
): Readonly<Record<string, string>> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const allowed: Readonly<Record<string, readonly string[]>> = {
    source: ['chrome-prompt-api'],
    status: ['available', 'unavailable', 'downloadable', 'downloading'],
    promptMode: ['promptStreaming'],
    outputLanguage: ['en', 'es', 'ja', 'de', 'fr'],
  };
  const values = Object.entries(allowed).flatMap(([key, candidates]) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    const value: unknown =
      descriptor && 'value' in descriptor ? descriptor.value : undefined;
    return typeof value === 'string' && candidates.includes(value)
      ? [[key, value]]
      : [];
  });
  return values.length ? Object.freeze(Object.fromEntries(values)) : null;
}

/** Captures effective local SDK requests and events with fresh application context per turn. */
export function createWorkbenchLocalTransport(
  store: WorkbenchStore,
  options: { readonly delegate?: Transport } = {},
): Transport {
  const delegate =
    options.delegate ??
    experimental_chrome({
      outputLanguage: 'en',
      events: {
        downloadRequired: () => {
          throw new Error('Select Prepare model before generating.');
        },
      },
    })();
  const capture = createWorkbenchTransport(store, delegate, 'native:chrome');
  let nonce = 0;
  return {
    name: 'WorkbenchLocalModelTransport',
    async send(request) {
      const currentNonce = ++nonce;
      const snapshot = store.getSnapshot();
      const userId = snapshot.frame?.messages
        .filter((message) => message.role === 'user')
        .at(-1)?.id;
      if (
        snapshot.cursor !== null ||
        snapshot.status !== 'loading' ||
        snapshot.frame?.localModel?.state !== 'ready' ||
        request.signal.aborted
      )
        throw new Error(
          'Prepare the local model and start a live turn before generating.',
        );
      if (request.input.tools.length)
        throw new Error('This local lesson does not expose browser tools.');
      const application = JSON.stringify(snapshot.application);
      const suffix = `\n\nCurrent application context (application-owned snapshot):\n${application}`;
      const systemIndex = request.input.messages.findIndex(
        (message) => message.role === 'system',
      );
      const messages =
        systemIndex < 0
          ? [
              {
                id: 'local-policy',
                role: 'system' as const,
                content: workbenchLocalModelSystem + suffix,
              },
              ...request.input.messages,
            ]
          : request.input.messages.map((message, index) =>
              index === systemIndex && message.role === 'system'
                ? { ...message, content: String(message.content) + suffix }
                : message,
            );
      store.record('source', { source: 'local-model' });
      const response = await capture.send({
        ...request,
        input: { ...request.input, messages },
      });
      const current = store.getSnapshot();
      const native = captureLocalMetadata(response.metadata);
      if (
        native &&
        nonce === currentNonce &&
        !request.signal.aborted &&
        current.cursor === null &&
        current.status === 'loading' &&
        current.turn === snapshot.turn &&
        current.frame?.messages
          .filter((message) => message.role === 'user')
          .at(-1)?.id === userId
      )
        store.record('source', { source: 'local-model', native });
      return response;
    },
  };
}
