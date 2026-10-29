import type { WorkbenchLessonId } from './workbench-lessons';

/**
 * The workbench lesson closest to a docs page that has no inline panel of its
 * own, keyed by slug path without the SDK (for example `'guide/ethics'`). Each
 * key must exist for both SDKs. Migrations, API reference, the threadplane
 * recipe and the atc sample are left out on purpose: no lesson is their
 * subject.
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
  // Provider pages and the platforms overview close by pointing the reader at
  // first-plan: compare the AG-UI request and stream with the server route.
  'platform/openai': 'first-plan',
  'platform/azure': 'first-plan',
  'platform/anthropic': 'first-plan',
  'platform/google': 'first-plan',
  'platform/bedrock': 'first-plan',
  'platform/ollama': 'first-plan',
  'platform/custom': 'first-plan',
  'platform/dotnet': 'first-plan',
  'start/platforms': 'first-plan',
  // The API chooser's teaser is the generative UI result.
  'start/overview': 'generative-ui',
};
