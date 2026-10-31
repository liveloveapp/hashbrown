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
  /**
   * The lesson's files and the page's highlights (see `workbenchPageData`);
   * the Source tab is hidden without it.
   */
  readonly source?: WorkbenchSourceData;
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
export function WorkbenchPanel({ lesson, sdk, source }: WorkbenchPanelProps) {
  const origin = workbenchOrigin();
  const mediaId = workbenchMediaId(lesson, sdk);
  const media = DOCS_DEMOS[mediaId];
  const { width, height } = media.dimensions;
  // Lessons the hosted workbench cannot run get no hosted link: production
  // references are not served, and loopback lessons show only a run-locally
  // notice there. Their Live tab points at the instructions instead.
  const availability = workbenchLiveAvailability(lesson, sdk);
  const openHref =
    isHostedWorkbenchLesson(lesson) && availability.live
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
      availability={availability}
      openHref={openHref}
      fallback={<DocsDemoVideo demo={mediaId} deferPoster />}
      source={source}
    />
  );
}
