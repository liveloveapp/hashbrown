import type { ReactNode } from 'react';
import type { ApiMember } from '../../lib/api-reference';
import { MemberLink } from './MemberLink';
import styles from './SymbolApi.module.css';
import type { SymbolRenderContext } from './symbol-context';
import {
  bodyMembers,
  footerExcerpt,
  headerExcerpt,
  memberExcerpt,
} from './symbol-model';
import { SymbolExcerpt } from './SymbolExcerpt';

/** How much a {@link SymbolApi} block shows: `0` links members, `-1` is compact. */
export type SymbolApiDensity = '0' | '-1';

/** A dark panel with a raised border, around excerpts. Port of `SymbolExcerptGroup`. */
export function SymbolExcerptGroup({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={[styles.groupHost, className].filter(Boolean).join(' ')}>
      <div className={styles.group}>
        <div className={styles.groupContent}>{children}</div>
      </div>
    </div>
  );
}

/**
 * The "API" block: a symbol's signature, or for classes, interfaces, enums and
 * namespaces its header, members and closing brace. At density `0` each member
 * links to its panel below. Port of `SymbolApi`.
 */
export function SymbolApi({
  symbol,
  context,
  density = '0',
}: {
  symbol: ApiMember;
  context: SymbolRenderContext;
  density?: SymbolApiDensity;
}) {
  const footer = footerExcerpt(symbol);
  return (
    <div className={styles.api}>
      <h2>API</h2>
      <SymbolExcerptGroup className={`d${density}`}>
        <SymbolExcerpt excerpt={headerExcerpt(symbol)} context={context} />
        <div className={styles.members}>
          {bodyMembers(symbol).map((member) =>
            density === '0' ? (
              <MemberLink
                key={member.canonicalReference}
                id={member.name}
                className={styles.memberLink}
              >
                <SymbolExcerpt
                  excerpt={memberExcerpt(member)}
                  context={context}
                  deprecated={Boolean(member.docs.deprecated)}
                  linked={false}
                />
              </MemberLink>
            ) : (
              <SymbolExcerpt
                key={member.canonicalReference}
                excerpt={memberExcerpt(member)}
                context={context}
                deprecated={Boolean(member.docs.deprecated)}
              />
            ),
          )}
        </div>
        {footer ? <SymbolExcerpt excerpt={footer} context={context} /> : null}
      </SymbolExcerptGroup>
    </div>
  );
}
