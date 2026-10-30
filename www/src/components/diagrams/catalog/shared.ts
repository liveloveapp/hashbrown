import type { DiagramDefinition } from '../diagram-types';

export const SHARED_DIAGRAMS = {
  'request-boundary': {
    kind: 'architecture',
    title: 'Keep provider access on your server',
    caption:
      'Your client owns rendering. Your endpoint checks access and calls the provider with server credentials.',
    description:
      'The browser sends messages to an application endpoint. The endpoint checks access and calls the provider. The provider response returns through the endpoint as events for the client to render. Credentials stay on the server. Solid arrows show requests; dashed arrows show returned data.',
    width: 740,
    height: 730,
    groups: [
      { label: 'BROWSER', x: 80, y: 12, width: 580, height: 180 },
      { label: 'APPLICATION SERVER', x: 80, y: 270, width: 580, height: 180 },
      { label: 'PROVIDER', x: 80, y: 530, width: 580, height: 180 },
    ],
    nodes: [
      {
        id: 'client',
        x: 220,
        y: 70,
        width: 300,
        title: 'Your client',
        detail: 'Messages and UI',
      },
      {
        id: 'endpoint',
        x: 220,
        y: 330,
        width: 300,
        title: 'Your endpoint',
        detail: 'Access and credentials',
        accent: true,
      },
      {
        id: 'provider',
        x: 220,
        y: 590,
        width: 300,
        title: 'Model provider',
        detail: 'Model inference',
      },
    ],
    edges: [
      {
        from: 'client',
        to: 'endpoint',
        points: [
          [300, 164],
          [300, 330],
        ],
        label: { text: 'messages', x: 230, y: 242 },
      },
      {
        from: 'endpoint',
        to: 'provider',
        points: [
          [300, 424],
          [300, 590],
        ],
        label: { text: 'request', x: 230, y: 502 },
      },
      {
        from: 'provider',
        to: 'endpoint',
        points: [
          [440, 590],
          [440, 424],
        ],
        label: { text: 'response', x: 510, y: 502 },
        dashed: true,
      },
      {
        from: 'endpoint',
        to: 'client',
        points: [
          [440, 330],
          [440, 164],
        ],
        label: { text: 'events', x: 510, y: 242 },
        dashed: true,
      },
    ],
  },
} satisfies Record<string, DiagramDefinition>;
