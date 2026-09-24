import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { docsComponents } from '../../../../components/docs-components';
import { MarkdownPage } from '../../../../components/markdown/MarkdownPage';
import { listDocs, readDoc, type Sdk, SDKS } from '../../../../lib/content';
import { renderMarkdown } from '../../../../lib/markdown';
import { pageMetadata } from '../../../../lib/site-metadata';

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
    ? pageMetadata({ title: doc.title, description: doc.description })
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
  const { content, headings } = await renderMarkdown(
    doc.body,
    docsComponents(sdk),
  );
  return <MarkdownPage headings={headings}>{content}</MarkdownPage>;
}
