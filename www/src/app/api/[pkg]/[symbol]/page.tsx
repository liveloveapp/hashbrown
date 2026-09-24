import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Symbol } from '../../../../components/api/Symbol';
import { buildSymbolContext } from '../../../../components/api/symbol-context';
import {
  listSymbolPages,
  loadReferenceData,
} from '../../../../lib/api-reference';
import { pageMetadata } from '../../../../lib/site-metadata';
import styles from './page.module.css';

type Params = { pkg: string; symbol: string };

/**
 * Pre-render every symbol with reference JSON, plus the namespace members the
 * Angular site served (`/api/core/s.string`).
 */
export function generateStaticParams(): Params[] {
  return listSymbolPages();
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { pkg, symbol } = await params;
  // Same title as the Analog symbol page's routeMeta.
  return pageMetadata({
    title: `@hashbrownai/${pkg}.${symbol}: Hashbrown API`,
    description: 'Hashbrown API documentation.',
  });
}

/** An API reference page. Port of `pages/api/[package]/[symbol].page.ts`. */
export default async function SymbolPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { pkg, symbol } = await params;
  const summary = loadReferenceData(pkg, decodeURIComponent(symbol));
  if (!summary) {
    notFound();
  }
  const context = await buildSymbolContext(summary, pkg);
  return (
    <div className={styles.page}>
      <Symbol summary={summary} context={context} />
    </div>
  );
}
