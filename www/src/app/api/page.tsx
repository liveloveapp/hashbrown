import type { Metadata } from 'next';
import { ApiIndex } from '../../components/api/ApiIndex';
import { readApiReport } from '../../lib/api-reference';
import { pageMetadata } from '../../lib/site-metadata';

// Same title and description as the Analog index routeMeta.
export const metadata: Metadata = pageMetadata({
  title: 'Home: Hashbrown API',
  description: 'Hashbrown API documentation.',
});

/** `/api`: search and filter every symbol in the API report. */
export default function ApiIndexPage() {
  return <ApiIndex report={readApiReport()} />;
}
