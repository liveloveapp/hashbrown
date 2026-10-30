import { workbenchLessons } from '../../../../../examples/quickstart/runtime/workbench-lessons';
import { findWorkbenchLesson } from '../../../../components/workbench/workbench-lessons';
import { type Sdk, SDKS } from '../../../../lib/content';
import { highlightWorkbenchSource } from '../../../../lib/workbench-source-files';

export const dynamic = 'force-static';
export const dynamicParams = false;

interface WorkbenchSourceParams {
  sdk: string;
  lesson: string;
}

/** One highlighted source bundle per lesson and SDK, prerendered. */
export function generateStaticParams(): WorkbenchSourceParams[] {
  return SDKS.flatMap((sdk) =>
    workbenchLessons.map((lesson) => ({ sdk, lesson: lesson.id })),
  );
}

/**
 * A lesson's highlighted source files as JSON, fetched by a docs workbench
 * panel's Source tab the first time a reader opens it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<WorkbenchSourceParams> },
) {
  const { sdk, lesson } = await params;
  const match = findWorkbenchLesson(lesson);
  if (!SDKS.includes(sdk as Sdk) || !match) {
    return new Response('Not found', { status: 404 });
  }
  return Response.json(await highlightWorkbenchSource(match.id, sdk as Sdk));
}
