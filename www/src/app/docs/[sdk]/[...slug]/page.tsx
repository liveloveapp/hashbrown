import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { renderDocsMarkdown } from '../../../../components/docs-markdown';
import { WorkbenchLauncher } from '../../../../components/workbench/WorkbenchLauncher';
import { WORKBENCH_CLOSEST_LESSON } from '../../../../components/workbench/workbench-page-lessons';
import { MarkdownPage } from '../../../../components/markdown/MarkdownPage';
import { listDocs, readDoc, type Sdk, SDKS } from '../../../../lib/content';
import { pageMetadata } from '../../../../lib/site-metadata';
import { buildWorkbenchSource } from '../../../../lib/workbench-source-files';

type Params = { sdk: string; slug: string[] };

const isSdk = (value: string): value is Sdk =>
  (SDKS as readonly string[]).includes(value);

/** Pre-render every docs page for both SDKs. */
export function generateStaticParams(): Params[] {
  return SDKS.flatMap((sdk) => listDocs(sdk).map((slug) => ({ sdk, slug })));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { sdk, slug } = await params;
  const doc = isSdk(sdk) ? readDoc(sdk, slug) : undefined;
  return doc
    ? pageMetadata({
        title: doc.title,
        description: doc.description,
        image: `/og/docs/${sdk}/${slug.join('/')}`,
        path: `/docs/${sdk}/${slug.join('/')}`,
      })
    : {};
}

/** A docs page rendered from the existing markdown. */
export default async function DocsPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { sdk, slug } = await params;
  const doc = isSdk(sdk) ? readDoc(sdk, slug) : undefined;
  if (!doc) {
    notFound();
  }
  const { content, headings } = await renderDocsMarkdown(doc.body, sdk);
  // Pages without a panel of their own offer their closest lesson instead.
  const closest =
    !isSdk(sdk) || doc.body.includes('<hb-workbench')
      ? undefined
      : WORKBENCH_CLOSEST_LESSON[slug.join('/')];
  return (
    <MarkdownPage headings={headings}>
      {content}
      {closest && isSdk(sdk) ? (
        <WorkbenchLauncher
          lesson={closest}
          sdk={sdk}
          source={buildWorkbenchSource(closest, sdk, [])}
        />
      ) : null}
    </MarkdownPage>
  );
}
