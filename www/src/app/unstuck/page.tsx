import type { Metadata } from 'next';
import styles from '../../components/layout/SectionShell.module.css';
import { Footer } from '../../components/site/Footer';
import { Header } from '../../components/site/Header';
import { UnstuckForm } from '../../components/unstuck/UnstuckForm';
import pageStyles from '../../components/unstuck/UnstuckPage.module.css';
import {
  UNSTUCK_FALLBACK_ADDRESS,
  UNSTUCK_FORM_DISCLOSURE,
  UNSTUCK_FORM_POLICY_VERSION,
  unstuckFormEnabled,
} from '../../lib/growth/form-route';
import { DEFAULT_CARD_IMAGE, pageMetadata } from '../../lib/site-metadata';

/** Read the launch switch on every request, not once at build time. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMetadata({
  title: 'Get unstuck: Hashbrown',
  description:
    'Stuck building with Hashbrown? Tell Brian, the founding engineer, where.',
  image: DEFAULT_CARD_IMAGE,
});

/**
 * The Get unstuck page. With `GROWTH_UNSTUCK_FORM_ENABLED=true` it shows the
 * form; otherwise it shows the fallback address and renders no form, so
 * nothing on the page promises a reply that will not come.
 */
export default function UnstuckPage() {
  const enabled = unstuckFormEnabled(process.env);
  return (
    <div className={`${styles.shell} ${styles.blog}`}>
      <Header />
      <div className={styles.blogPanel}>
        <main className={pageStyles.page}>
          <h1 className={pageStyles.heading}>Stuck? Ask Brian.</h1>
          <p className={pageStyles.lede}>
            I&apos;m the founding engineer of Hashbrown, and I read every one of
            these.
          </p>
          {enabled ? (
            <UnstuckForm
              policyVersion={UNSTUCK_FORM_POLICY_VERSION}
              disclosure={UNSTUCK_FORM_DISCLOSURE}
              fallbackAddress={UNSTUCK_FALLBACK_ADDRESS}
            />
          ) : (
            <p className={pageStyles.lede}>
              Write to Brian at{' '}
              <a href={`mailto:${UNSTUCK_FALLBACK_ADDRESS}`}>
                {UNSTUCK_FALLBACK_ADDRESS}
              </a>
              .
            </p>
          )}
        </main>
        <Footer />
      </div>
    </div>
  );
}
