import type { WorkbenchLessonId } from './workbench-lessons';

/**
 * The workbench lesson closest to a docs page that has no inline panel of its
 * own, keyed by slug path without the SDK (for example `'guide/ethics'`). Each
 * key must exist for both SDKs. Only pages whose subject is the lesson's
 * subject are listed: migrations, API reference and provider setup pages are
 * left out on purpose.
 */
export const WORKBENCH_CLOSEST_LESSON: Readonly<
  Record<string, WorkbenchLessonId>
> = {
  // Guides whose "Explore it in the workbench" section already names the lesson.
  'guide/choosing-model': 'structured-output',
  'guide/ethics': 'natural-forms',
  'guide/prompt-engineering': 'system-instructions',
  // Platform pages about one capability the lesson demonstrates end to end.
  'platform/langgraph': 'tools',
  'platform/typesafe': 'decisions',
  'platform/dotnet-native-tools': 'interrupts',
};
