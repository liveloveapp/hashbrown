/** The checked, server-owned workbench lessons. */
export type WorkbenchLessonId =
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
  | 'request-transformation';
/** Metadata shared by framework clients and their workbench shell. */
export interface WorkbenchLesson {
  readonly id: WorkbenchLessonId;
  readonly title: string;
  readonly format:
    'ui' | 'structured' | 'decision' | 'text' | 'predictions' | 'selection';
  readonly protocol: 'chat' | 'decision';
  readonly inspector:
    'Markdown' | 'JSON' | 'Requests' | 'UI' | 'State' | 'Schema' | 'Transform';
  readonly endpoint: string;
}
/** The sidebar sections; conversations are listed above the lesson groups. */
export type WorkbenchSidebarSection =
  'conversations' | 'concepts' | 'production' | 'recipes';
/** The lesson groups shown in the sidebar, in display order. */
export const workbenchLessonGroups: readonly {
  readonly id: Exclude<WorkbenchSidebarSection, 'conversations'>;
  readonly title: string;
  readonly lessons: readonly WorkbenchLessonId[];
}[] = [
  {
    id: 'concepts',
    title: 'Concepts',
    lessons: [
      'generative-ui',
      'tools',
      'structured-output',
      'streaming',
      'schemas',
      'decisions',
    ],
  },
  {
    id: 'production',
    title: 'Production',
    lessons: ['debugging', 'request-transformation'],
  },
  {
    id: 'recipes',
    title: 'Recipes',
    lessons: ['magic-text', 'predictions', 'ui-selection'],
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
];
/** Resolves a validated lesson query, defaulting safely to Generative UI. */
export function getWorkbenchLesson(search: string): WorkbenchLesson {
  const id = new URLSearchParams(search).get('lesson');
  return (
    workbenchLessons.find((lesson) => lesson.id === id) ?? workbenchLessons[0]
  );
}
