import type { Sdk } from '@/lib/content';
import { DOCS_DEMOS } from '../elements/docs-demo-media';
import { DocsDemoVideo } from '../elements/DocsDemoVideo';
import {
  isHostedWorkbenchLesson,
  PARTIAL_CAPTURE_LESSONS,
  WORKBENCH_LESSONS_WITHOUT_CAPTURE,
  type WorkbenchLessonId,
  workbenchLessonTitle,
  workbenchLiveAvailability,
  workbenchMediaId,
  workbenchOrigin,
  type WorkbenchSourceData,
} from './workbench-lessons';
import { WorkbenchPanelLoader } from './WorkbenchPanelLoader';

/** Props for {@link WorkbenchPanel}. */
export interface WorkbenchPanelProps {
  readonly lesson: WorkbenchLessonId;
  readonly sdk: Sdk;
  /** Highlighted lesson source; the Source tab is hidden without it. */
  readonly source?: WorkbenchSourceData;
  /** Milestones the page's prose refers to (unused until moments land). */
  readonly moments?: readonly string[];
}

/**
 * An inline workbench for a docs page: a Replay of the recorded run, an
 * opt-in Live workbench and, when given, the lesson source. Narrow screens
 * and failed replays get the recorded video instead.
 *
 * Renders on the server: the video catalog and lesson tables stay out of the
 * client bundle, which gets only the plain values below and the pre-rendered
 * video.
 */
export function WorkbenchPanel({
  lesson,
  sdk,
  source,
  moments,
}: WorkbenchPanelProps) {
  const origin = workbenchOrigin();
  const mediaId = workbenchMediaId(lesson, sdk);
  const media = DOCS_DEMOS[mediaId];
  const { width, height } =
    'dimensions' in media ? media.dimensions : { width: 1440, height: 810 };
  // Lessons the hosted workbench does not serve get no hosted link; their
  // Live tab points at the local instructions instead.
  const openHref = isHostedWorkbenchLesson(lesson)
    ? `${origin}/${sdk}.html?lesson=${lesson}`
    : null;
  return (
    <WorkbenchPanelLoader
      lesson={lesson}
      sdk={sdk}
      origin={origin}
      mediaId={mediaId}
      title={workbenchLessonTitle(lesson)}
      width={width}
      height={height}
      hasCapture={!WORKBENCH_LESSONS_WITHOUT_CAPTURE.includes(lesson)}
      partialCapture={PARTIAL_CAPTURE_LESSONS.includes(lesson)}
      availability={workbenchLiveAvailability(lesson, sdk)}
      openHref={openHref}
      fallback={<DocsDemoVideo demo={mediaId} />}
      source={source}
      moments={moments}
    />
  );
}
