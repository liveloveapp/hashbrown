import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { docsComponents } from '../../../../components/docs-components';
import { listDocs, readDoc, SDKS, type Sdk } from '../../../../lib/content';
import { renderMarkdown } from '../../../../lib/markdown';
import styles from '../../docs.module.css';

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
  return doc ? { title: doc.title, description: doc.description } : {};
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
  return (
    <article className={styles.prose}>
      {await renderMarkdown(doc.body, docsComponents(sdk))}
    </article>
  );
}
