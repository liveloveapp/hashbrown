import type { Sdk } from '@/lib/content';
import type {
  WorkbenchLessonId,
  WorkbenchSourceData,
} from './workbench-lessons';
import { workbenchLessonTitle } from './workbench-lessons';
import { WorkbenchLauncherToggle } from './WorkbenchLauncherToggle';
import { WorkbenchPanel } from './WorkbenchPanel';

/** Props for {@link WorkbenchLauncher}. */
export interface WorkbenchLauncherProps {
  readonly lesson: WorkbenchLessonId;
  readonly sdk: Sdk;
  /** The lesson's files (no highlights), so the panel can show Source. */
  readonly source?: WorkbenchSourceData;
}

/**
 * A compact card for a docs page without its own panel: "Try this in the
 * workbench: <lesson>", with a button that expands into the lesson's panel.
 * Nothing loads (no panel chunk, frame, capture or video) until the reader
 * expands it.
 */
export function WorkbenchLauncher({
  lesson,
  sdk,
  source,
}: WorkbenchLauncherProps) {
  return (
    <WorkbenchLauncherToggle title={workbenchLessonTitle(lesson)}>
      <WorkbenchPanel lesson={lesson} sdk={sdk} source={source} />
    </WorkbenchLauncherToggle>
  );
}
