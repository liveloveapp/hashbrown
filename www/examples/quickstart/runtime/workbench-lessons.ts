/** The checked, server-owned workbench lessons. */
export type WorkbenchLessonId =
  | 'production-recovery'
  | 'local-models'
  | 'javascript-runtime'
  | 'ui-kits'
  | 'ui-chatbot'
  | 'agent-decisions'
  | 'json-parser'
  | 'natural-forms'
  | 'server-threads'
  | 'public-endpoint'
  | 'first-plan'
  | 'conversation'
  | 'system-instructions'
  | 'magic-text'
  | 'predictions'
  | 'ui-selection'
  | 'generative-ui'
  | 'tools'
  | 'structured-output'
  | 'streaming'
  | 'schemas'
  | 'decisions'
  | 'debugging'
  | 'request-transformation'
  | 'shared-state'
  | 'activities'
  | 'interrupts'
  | 'message-history'
  | 'save-text-conversations';
/** Metadata shared by framework clients and their workbench shell. */
export interface WorkbenchLesson {
  /** Requires the opt-in Postgres host instead of the public anonymous backend. */
  readonly host?: 'production-reference';
  readonly id: WorkbenchLessonId;
  readonly title: string;
  readonly format:
    | 'ui'
    | 'structured'
    | 'decision'
    | 'text'
    | 'predictions'
    | 'selection'
    | 'workflow'
    | 'history';
  readonly protocol: 'chat' | 'decision' | 'runtime' | 'local';
  readonly inspector:
    | 'Model'
    | 'Agent'
    | 'Parser'
    | 'Form'
    | 'Markdown'
    | 'JSON'
    | 'Requests'
    | 'UI'
    | 'State'
    | 'Activities'
    | 'Interrupts'
    | 'Schema'
    | 'Transform'
    | 'Instructions'
    | 'History'
    | 'Saved text'
    | 'Server'
    | 'Access'
    | 'Runtime';
  readonly endpoint: string;
}
/** The sidebar sections; conversations are listed above the lesson groups. */
export type WorkbenchSidebarSection =
  'conversations' | 'start' | 'concepts' | 'production' | 'recipes';
/** The lesson groups shown in the sidebar, in display order. */
export const workbenchLessonGroups: readonly {
  readonly id: Exclude<WorkbenchSidebarSection, 'conversations'>;
  readonly title: string;
  readonly lessons: readonly WorkbenchLessonId[];
}[] = [
  {
    id: 'start',
    title: 'Get started',
    lessons: ['first-plan', 'conversation', 'system-instructions'],
  },
  {
    id: 'concepts',
    title: 'Concepts',
    lessons: [
      'generative-ui',
      'tools',
      'javascript-runtime',
      'structured-output',
      'streaming',
      'schemas',
      'decisions',
      'shared-state',
      'activities',
      'interrupts',
      'message-history',
    ],
  },
  {
    id: 'production',
    title: 'Production',
    lessons: [
      'production-recovery',
      'local-models',
      'debugging',
      'request-transformation',
      'save-text-conversations',
      'server-threads',
      'public-endpoint',
    ],
  },
  {
    id: 'recipes',
    title: 'Recipes',
    lessons: [
      'magic-text',
      'predictions',
      'ui-selection',
      'ui-kits',
      'ui-chatbot',
      'agent-decisions',
      'json-parser',
      'natural-forms',
    ],
  },
];
/** The allowlisted lesson catalog; browser input cannot select arbitrary endpoints. */
export const workbenchLessons: readonly WorkbenchLesson[] = [
  {
    id: 'generative-ui',
    title: 'Generative UI',
    format: 'ui',
    inspector: 'UI',
    protocol: 'chat',
    endpoint: '/api/workbench/generative-ui',
  },
  {
    id: 'tools',
    title: 'Tools',
    format: 'ui',
    inspector: 'Requests',
    protocol: 'chat',
    endpoint: '/api/workbench/tools',
  },
  {
    id: 'javascript-runtime',
    title: 'JavaScript runtime',
    format: 'text',
    protocol: 'runtime',
    inspector: 'Runtime',
    endpoint: '',
  },

  {
    id: 'local-models',
    title: 'Local models',
    format: 'structured',
    inspector: 'Model',
    protocol: 'local',
    endpoint: '',
  },
  {
    id: 'structured-output',
    title: 'Structured output',
    format: 'structured',
    inspector: 'JSON',
    protocol: 'chat',
    endpoint: '/api/workbench/structured-output',
  },
  {
    id: 'streaming',
    title: 'Streaming',
    format: 'structured',
    inspector: 'JSON',
    protocol: 'chat',
    endpoint: '/api/workbench/streaming',
  },
  {
    id: 'schemas',
    title: 'Schemas',
    format: 'structured',
    inspector: 'Schema',
    protocol: 'chat',
    endpoint: '/api/workbench/schemas',
  },
  {
    id: 'decisions',
    title: 'Decisions',
    format: 'decision',
    inspector: 'JSON',
    protocol: 'decision',
    endpoint: '/api/workbench/decisions',
  },
  {
    id: 'debugging',
    title: 'Debugging',
    format: 'ui',
    inspector: 'Requests',
    protocol: 'chat',
    endpoint: '/api/workbench/debugging',
  },
  {
    id: 'request-transformation',
    title: 'Request transformation',
    format: 'ui',
    inspector: 'Transform',
    protocol: 'chat',
    endpoint: '/api/workbench/request-transformation',
  },
  {
    id: 'magic-text',
    title: 'Magic Text',
    format: 'text',
    protocol: 'chat',
    inspector: 'Markdown',
    endpoint: '/api/workbench/magic-text',
  },
  {
    id: 'predictions',
    title: 'Predictive suggestions',
    format: 'predictions',
    protocol: 'chat',
    inspector: 'JSON',
    endpoint: '/api/workbench/predictions',
  },
  {
    id: 'ui-selection',
    title: 'UI selection',
    format: 'selection',
    protocol: 'decision',
    inspector: 'UI',
    endpoint: '/api/workbench/ui-selection',
  },
  {
    id: 'first-plan',
    title: 'First plan',
    format: 'ui',
    protocol: 'chat',
    inspector: 'UI',
    endpoint: '/api/workbench/first-plan',
  },
  {
    id: 'conversation',
    title: 'Messages and turns',
    format: 'text',
    protocol: 'chat',
    inspector: 'Requests',
    endpoint: '/api/workbench/conversation',
  },
  {
    id: 'system-instructions',
    title: 'System instructions',
    format: 'text',
    protocol: 'chat',
    inspector: 'Instructions',
    endpoint: '/api/workbench/system-instructions',
  },
  ...(['ui-kits', 'ui-chatbot'] as const).map((id) => ({
    id,
    title: id === 'ui-kits' ? 'UI Kits' : 'UI chatbot',
    format: 'ui' as const,
    inspector: 'UI' as const,
    protocol: 'chat' as const,
    endpoint: `/api/workbench/${id}`,
  })),
  ...(['shared-state', 'activities', 'interrupts'] as const).map((id) => ({
    id,
    title: {
      'shared-state': 'Shared agent state',
      activities: 'Activities',
      interrupts: 'Interrupt and resume',
    }[id],
    format: 'workflow' as const,
    inspector:
      id === 'activities'
        ? ('Activities' as const)
        : id === 'interrupts'
          ? ('Interrupts' as const)
          : ('State' as const),
    protocol: 'chat' as const,
    endpoint: `/api/workbench/${id}`,
  })),
  ...(['server-threads', 'public-endpoint'] as const).map((id) => ({
    id,
    title: id === 'server-threads' ? 'Server threads' : 'Public endpoints',
    format: 'history' as const,
    protocol: 'chat' as const,
    inspector:
      id === 'server-threads' ? ('Server' as const) : ('Access' as const),
    endpoint: `/api/workbench/server/${id}/chat`,
  })),
  ...(['message-history', 'save-text-conversations'] as const).map((id) => ({
    id,
    title:
      id === 'message-history' ? 'Message history' : 'Save text conversations',
    format: 'history' as const,
    inspector:
      id === 'message-history' ? ('History' as const) : ('Saved text' as const),
    protocol: 'chat' as const,
    endpoint: `/api/workbench/${id}`,
  })),
  ...(['agent-decisions', 'json-parser', 'natural-forms'] as const).map(
    (id) => ({
      id,
      title: {
        'agent-decisions': 'Decisions in agents',
        'json-parser': 'JSON parser',
        'natural-forms': 'Natural language forms',
      }[id],
      format: 'history' as const,
      protocol: 'chat' as const,
      inspector:
        id === 'agent-decisions'
          ? ('Agent' as const)
          : id === 'json-parser'
            ? ('Parser' as const)
            : ('Form' as const),
      endpoint: `/api/workbench/${id}`,
    }),
  ),
  {
    id: 'production-recovery',
    title: 'Production recovery',
    format: 'workflow',
    protocol: 'chat',
    inspector: 'State',
    endpoint: '/api/production/run',
    host: 'production-reference',
  },
];
/** Lessons supported by the public anonymous backend and its deterministic verification host. */
export const hostedWorkbenchLessons = workbenchLessons.filter(
  (lesson) => !lesson.host,
);

/** Resolves a validated lesson query, defaulting safely to Generative UI. */
export function getWorkbenchLesson(search: string): WorkbenchLesson {
  const id = new URLSearchParams(search).get('lesson');
  return (
    workbenchLessons.find((lesson) => lesson.id === id) ?? workbenchLessons[0]
  );
}
