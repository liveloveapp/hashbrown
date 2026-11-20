import {
  isWorkbenchLoopbackLesson,
  type WorkbenchLesson,
  type WorkbenchLessonId,
} from './workbench-lessons';

/** Which tabs show in the bar and which go into More. */
export interface WorkbenchTabLayout {
  readonly bar: readonly string[];
  readonly more: readonly string[];
}

/** The one companion view per lesson whose docs teach two views together. */
export const workbenchTabCompanions: Readonly<
  Partial<Record<WorkbenchLessonId, string>>
> = {
  'ui-kits': 'Kit',
  'ui-chatbot': 'Kit',
  'javascript-runtime': 'Code',
  activities: 'Interrupts',
  interrupts: 'Activities',
  'server-threads': 'History',
  'message-history': 'Saved text',
  'save-text-conversations': 'History',
};

/**
 * Lists every inspector tab a lesson has, in display order. With no lesson it
 * returns the default list.
 */
export function workbenchInspectorTabs(
  lesson: Pick<WorkbenchLesson, 'id' | 'format'> | undefined,
): readonly string[] {
  return [
    ['json-parser', 'natural-forms'].includes(lesson?.id ?? '')
      ? 'JSON'
      : ['text', 'workflow', 'history'].includes(lesson?.format ?? '')
        ? lesson?.id === 'prose'
          ? 'Markdown'
          : 'Text'
        : 'JSON',
    'Requests',
    ...(lesson?.id === 'local-models' ? ['Model'] : []),
    ...(lesson?.id === 'javascript-runtime' ? ['Code', 'Runtime'] : []),
    ...(['ui-kits', 'ui-chatbot'].includes(lesson?.id ?? '')
      ? ['Kit', 'Schema']
      : []),
    ...(lesson?.format === 'history'
      ? lesson.id === 'agent-decisions'
        ? ['History', 'Agent']
        : ['json-parser', 'natural-forms'].includes(lesson.id)
          ? [
              'History',
              'Parser',
              ...(lesson.id === 'natural-forms' ? ['Form'] : []),
              'Schema',
            ]
          : isWorkbenchLoopbackLesson(lesson.id)
            ? ['History', 'Server', 'Access']
            : ['History', 'Saved text']
      : []),
    ...(['structured', 'predictions', 'selection'].includes(
      lesson?.format ?? '',
    )
      ? ['Schema']
      : []),
    ...(lesson?.id === 'request-transformation' ? ['Transform'] : []),
    ...(lesson?.id === 'system-instructions' ? ['Instructions'] : []),
    'UI',
    'State',
    ...(lesson?.format === 'workflow' ? ['Activities', 'Interrupts'] : []),
  ];
}

/**
 * Splits a lesson's tabs into the bar and the More menu: the lead view, at
 * most one companion, then Requests and State. Everything else goes to More in
 * its original order.
 */
export function workbenchTabLayout(
  lesson: Pick<WorkbenchLesson, 'id' | 'inspector'>,
  tabs: readonly string[],
): WorkbenchTabLayout {
  const wanted = [
    lesson.inspector,
    workbenchTabCompanions[lesson.id],
    'Requests',
    'State',
  ];
  const bar = wanted.reduce<readonly string[]>(
    (shown, name) =>
      name !== undefined && tabs.includes(name) && !shown.includes(name)
        ? [...shown, name]
        : shown,
    [],
  );
  return { bar, more: tabs.filter((name) => !bar.includes(name)) };
}
