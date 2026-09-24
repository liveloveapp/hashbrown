import { bySdk, type Sdk, STEPS } from './home.content';
import { SdkSwitch } from './SdkSwitch';
import styles from './HowItWorks.module.css';

/**
 * The three "How it works" steps with build-time highlighted code for each
 * framework; the framework toggle picks which code shows. Titles and copy are
 * the same for both frameworks.
 *
 * @param props.stepsHtml - Highlighted step code for each framework, in order.
 */
export function HowItWorks({
  stepsHtml,
}: {
  stepsHtml: Record<Sdk, string[]>;
}) {
  return (
    <div className={styles.section}>
      <header className={styles.header}>
        <h2>How it works</h2>
        <p>The same API in React and Angular.</p>
      </header>
      <ol className={styles.steps}>
        {STEPS.angular.map((step, i) => (
          <li key={step.title}>
            <span className={styles.num}>{i + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            <SdkSwitch
              {...bySdk((sdk) => (
                <div
                  className={styles.code}
                  dangerouslySetInnerHTML={{ __html: stepsHtml[sdk][i] }}
                />
              ))}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
