import type { DotnetDocs, DotnetType } from '../../lib/dotnet-reference';
import {
  dotnetReferenceHref,
  readDotnetReference,
} from '../../lib/dotnet-reference';
import { highlightCode } from '../../lib/rehype-shiki';
import styles from './DotnetSymbol.module.css';

/** Render authored C# prose as text, linking only documented SDK XML identities. */
function Docs({ docs }: { docs: DotnetDocs }) {
  const reference = readDotnetReference();
  return (
    <>
      {docs.summary && <p className={styles.prose}>{docs.summary}</p>}
      {docs.remarks && (
        <>
          <h3>Remarks</h3>
          <p className={styles.prose}>{docs.remarks}</p>
        </>
      )}
      {docs.typeParams.length > 0 && (
        <>
          <h3>Type parameters</h3>
          <dl>
            {docs.typeParams.map((param) => (
              <div key={param.name}>
                <dt>
                  <code>{param.name}</code>
                </dt>
                <dd>{param.description}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {docs.params.length > 0 && (
        <>
          <h3>Parameters</h3>
          <dl>
            {docs.params.map((param) => (
              <div key={param.name}>
                <dt>
                  <code>{param.name}</code>
                </dt>
                <dd>{param.description}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {docs.returns && (
        <>
          <h3>Returns</h3>
          <p className={styles.prose}>{docs.returns}</p>
        </>
      )}
      {docs.references.length > 0 && (
        <>
          <h3>See also</h3>
          <ul>
            {docs.references.map((ref, index) => {
              const href = dotnetReferenceHref(ref.target, reference);
              return (
                <li key={ref.target + index}>
                  {href ? (
                    <a href={href}>{ref.text}</a>
                  ) : (
                    <span>
                      {ref.text} ({ref.target})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

/** Render a reviewed SDK type and its authored overloads using the existing C# highlighter. */
export async function DotnetSymbol({ symbol }: { symbol: DotnetType }) {
  const reference = readDotnetReference();
  const declarations = await Promise.all(
    [
      symbol.declaration,
      ...symbol.members.map((member) => member.declaration),
    ].map((code) => highlightCode(code, 'csharp')),
  );
  return (
    <article className={styles.article}>
      <p>Hashbrown.AspNetCore · C# API reference</p>
      <h1>{symbol.name}</h1>
      <p>Upcoming {reference.package.version} · Unreleased</p>
      <div
        className={styles.code}
        data-language="csharp"
        dangerouslySetInnerHTML={{ __html: declarations[0] }}
      />
      <Docs docs={symbol.docs} />
      {symbol.members.length > 0 && (
        <>
          <h2>Members</h2>
          <nav aria-label="Members">
            <ul>
              {symbol.members.map((member) => (
                <li key={member.id}>
                  <a href={'#' + member.anchor}>{member.name}</a>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
      {symbol.members.map((member, index) => (
        <section key={member.id} id={member.anchor} className={styles.member}>
          <h2>
            <a href={'#' + member.anchor}>{member.name}</a>
          </h2>
          <div
            className={styles.code}
            data-language="csharp"
            dangerouslySetInnerHTML={{ __html: declarations[index + 1] }}
          />
          <Docs docs={member.docs} />
        </section>
      ))}
    </article>
  );
}
