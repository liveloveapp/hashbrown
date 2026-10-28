import type { WorkbenchLessonId } from '../../../examples/quickstart/runtime/workbench-lessons';

/**
 * The media name a lesson's recordings are published under. Two early lessons
 * keep their short names; every other lesson uses its id.
 *
 * Type-only imports: the recorder runs under plain tsx and must stay free of
 * workspace packages.
 *
 * @param lesson - A workbench lesson id.
 */
export function workbenchMediaName(lesson: WorkbenchLessonId): string {
  if (lesson === 'generative-ui') return 'ui';
  if (lesson === 'structured-output') return 'structured';
  return lesson;
}
