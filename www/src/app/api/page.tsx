import { listDotnetSymbols } from '../../lib/dotnet-reference';
import styles from '../../components/api/ApiIndex.module.css';
import type { Metadata } from 'next';
import { ApiIndex } from '../../components/api/ApiIndex';
import { readApiReport } from '../../lib/api-reference';
import { DEFAULT_CARD_IMAGE, pageMetadata } from '../../lib/site-metadata';

// Same title and description as the Analog index routeMeta.
export const metadata: Metadata = pageMetadata({
  title: 'Home: Hashbrown API',
  description: 'Hashbrown API documentation.',
  image: DEFAULT_CARD_IMAGE,
  path: '/api',
});

/** `/api`: search and filter every symbol in the API report. */
export default function ApiIndexPage() {
  return (
    <>
      <ApiIndex report={readApiReport()} />
      <section className={styles.dotnet} aria-labelledby="dotnet-api-heading">
        <h2 id="dotnet-api-heading">Hashbrown.AspNetCore · C# API</h2>
        <p>Upcoming 0.1.0-preview.2 · Unreleased</p>
        <div className={styles.symbols}>
          {listDotnetSymbols().map((type) => (
            <a key={type.id} href={'/api/dotnet/' + type.slug}>
              {type.name}
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
