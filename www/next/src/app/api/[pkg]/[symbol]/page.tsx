import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { docsComponents } from '../../../../components/docs-components';
import { listSymbols, readSymbol } from '../../../../lib/api-reference';
import { renderMarkdown } from '../../../../lib/markdown';
import styles from '../../../docs/docs.module.css';

type Params = { pkg: string; symbol: string };

/** Pre-render a page for every symbol with reference JSON. */
export function generateStaticParams(): Params[] {
  return listSymbols();
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { pkg, symbol } = await params;
  return { title: `${symbol}: Hashbrown ${pkg} API` };
}

/** An API reference page: summary, signature and examples for each member. */
export default async function SymbolPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { pkg, symbol } = await params;
  const data = readSymbol(pkg, symbol);
  if (!data) {
    notFound();
  }
  const components = docsComponents(pkg === 'angular' ? 'angular' : 'react');
  const sections = await Promise.all(
    data.members.map(async (member) => ({
      key: member.canonicalReference,
      summary: await renderMarkdown(member.docs.summary, components),
      signature: await renderMarkdown(
        '```ts\n' + member.formattedContent + '\n```',
        components,
      ),
      examples: await Promise.all(
        member.docs.examples.map((example) =>
          renderMarkdown(example, components),
        ),
      ),
    })),
  );
  return (
    <article className={styles.prose}>
      <h1>
        {data.name} <small>{data.kind}</small>
      </h1>
      {sections.map((section) => (
        <section key={section.key}>
          {section.summary}
          {section.signature}
          {section.examples.map((example, index) => (
            <div key={index}>{example}</div>
          ))}
        </section>
      ))}
    </article>
  );
}
