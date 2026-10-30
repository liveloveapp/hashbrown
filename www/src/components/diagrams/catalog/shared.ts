import type { DiagramDefinition } from '../diagram-types';

export const SHARED_DIAGRAMS = {
  'request-boundary': {
    kind: 'architecture',
    title: 'Keep provider access on your server',
    caption:
      'Your client owns rendering. Your endpoint checks access and calls the provider with server credentials.',
    description:
      'The browser sends messages to an application endpoint. The endpoint checks access and calls the provider. The provider response returns through the endpoint as events for the client to render. Credentials stay on the server. Solid arrows show requests; dashed arrows show returned data.',
    width: 1040,
    height: 300,
    groups: [
      { label: 'BROWSER', x: 12, y: 12, width: 268, height: 276 },
      { label: 'APPLICATION SERVER', x: 382, y: 12, width: 276, height: 276 },
      { label: 'PROVIDER', x: 760, y: 12, width: 268, height: 276 },
    ],
    nodes: [
      {
        id: 'client',
        x: 36,
        y: 90,
        width: 220,
        title: 'Your client',
        detail: 'Messages and UI',
      },
      {
        id: 'endpoint',
        x: 406,
        y: 90,
        width: 228,
        title: 'Your endpoint',
        detail: 'Access and credentials',
        accent: true,
      },
      {
        id: 'provider',
        x: 784,
        y: 90,
        width: 220,
        title: 'Model provider',
        detail: 'Model inference',
      },
    ],
    edges: [
      {
        from: 'client',
        to: 'endpoint',
        points: [
          [256, 112],
          [406, 112],
        ],
        label: { text: 'messages', x: 331, y: 96 },
      },
      {
        from: 'endpoint',
        to: 'provider',
        points: [
          [634, 112],
          [784, 112],
        ],
        label: { text: 'request', x: 709, y: 96 },
      },
      {
        from: 'provider',
        to: 'endpoint',
        points: [
          [784, 158],
          [634, 158],
        ],
        label: { text: 'response', x: 709, y: 198 },
        dashed: true,
      },
      {
        from: 'endpoint',
        to: 'client',
        points: [
          [406, 158],
          [256, 158],
        ],
        label: { text: 'events', x: 331, y: 198 },
        dashed: true,
      },
    ],
  },
} satisfies Record<string, DiagramDefinition>;
