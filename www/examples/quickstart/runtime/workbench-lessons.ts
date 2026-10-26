/** The checked, server-owned workbench lessons. */
export type WorkbenchLessonId =
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
  readonly format: 'ui' | 'structured' | 'decision';
  readonly inspector:
    'JSON' | 'Requests' | 'UI' | 'State' | 'Schema' | 'Transform';
  readonly endpoint: string;
}
/** The allowlisted lesson catalog; browser input cannot select arbitrary endpoints. */
export const workbenchLessons: readonly WorkbenchLesson[] = [
  {
    id: 'generative-ui',
    title: 'Generative UI',
    format: 'ui',
    inspector: 'UI',
    endpoint: '/api/workbench/generative-ui',
  },
  {
    id: 'tools',
    title: 'Tools',
    format: 'ui',
    inspector: 'Requests',
    endpoint: '/api/workbench/tools',
  },
  {
    id: 'structured-output',
    title: 'Structured output',
    format: 'structured',
    inspector: 'JSON',
    endpoint: '/api/workbench/structured-output',
  },
  {
    id: 'streaming',
    title: 'Streaming',
    format: 'structured',
    inspector: 'JSON',
    endpoint: '/api/workbench/streaming',
  },
  {
    id: 'schemas',
    title: 'Schemas',
    format: 'structured',
    inspector: 'Schema',
    endpoint: '/api/workbench/schemas',
  },
  {
    id: 'decisions',
    title: 'Decisions',
    format: 'decision',
    inspector: 'JSON',
    endpoint: '/api/workbench/decisions',
  },
  {
    id: 'debugging',
    title: 'Debugging',
    format: 'ui',
    inspector: 'Requests',
    endpoint: '/api/workbench/debugging',
  },
  {
    id: 'request-transformation',
    title: 'Request transformation',
    format: 'ui',
    inspector: 'Transform',
    endpoint: '/api/workbench/request-transformation',
  },
];
/** Resolves a validated lesson query, defaulting safely to Generative UI. */
export function getWorkbenchLesson(search: string): WorkbenchLesson {
  const id = new URLSearchParams(search).get('lesson');
  return (
    workbenchLessons.find((lesson) => lesson.id === id) ?? workbenchLessons[0]
  );
}
