import type { Metadata } from 'next';
import { Footer } from '../../components/site/Footer';
import { Header } from '../../components/site/Header';
import { UnstuckForm } from '../../components/unstuck/UnstuckForm';
import pageStyles from '../../components/unstuck/UnstuckPage.module.css';
import {
  UNSTUCK_FALLBACK_ADDRESS,
  unstuckFormEnabled,
} from '../../lib/growth/form-route';
import { DEFAULT_CARD_IMAGE, pageMetadata } from '../../lib/site-metadata';

/** Read the launch switch on every request, not once at build time. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMetadata({
  title: 'Get unstuck: Hashbrown',
  description: 'Stuck building with Hashbrown? Tell me where.',
  image: DEFAULT_CARD_IMAGE,
  path: '/unstuck',
});

/**
 * The Get unstuck page: a centred headline and lede over one card. With
 * `GROWTH_UNSTUCK_FORM_ENABLED=true` the card holds the form; otherwise it
 * holds only the fallback address and renders no form, so nothing on the page
 * promises a reply that will not come.
 */
export default function UnstuckPage() {
  const enabled = unstuckFormEnabled(process.env);
  return (
    <div className={pageStyles.shell}>
      <Header />
      <main className={pageStyles.page}>
        <h1 className={pageStyles.heading}>Stuck? Tell me where.</h1>
        <p className={pageStyles.lede}>
          I&apos;m Brian, founder of Hashbrown. I&apos;d love to help you,
          engineer to engineer.
        </p>
        <div className={pageStyles.card}>
          {enabled ? (
            <UnstuckForm fallbackAddress={UNSTUCK_FALLBACK_ADDRESS} />
          ) : (
            <p>
              Email me at{' '}
              <a href={`mailto:${UNSTUCK_FALLBACK_ADDRESS}`}>
                {UNSTUCK_FALLBACK_ADDRESS}
              </a>
              .
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
