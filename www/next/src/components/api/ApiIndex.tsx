'use client';

import { useMemo, useState } from 'react';
import type { MinimizedApiReport } from '../../lib/api-reference';
import styles from './ApiIndex.module.css';
import { filterPackages, listKinds, toggleKind } from './api-index';
import { KindChip } from './KindChip';
import { SymbolChip } from './SymbolChip';

/** Tabler "search" icon, as the Angular `www-search` renders it. */
function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      style={{ height: '16px', width: '16px' }}
      aria-hidden="true"
    >
      <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M21 21l-6 -6" />
    </svg>
  );
}

/**
 * The `/api` index: search, kind filter and every symbol grouped by package.
 * Port of `pages/api/index.page.ts`; the report comes from the server as props.
 */
export function ApiIndex({ report }: { report: MinimizedApiReport }) {
  const [selectedKind, setSelectedKind] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const kinds = useMemo(() => listKinds(report), [report]);
  const packages = filterPackages(report, selectedKind, searchTerm);

  return (
    <div className={styles.index}>
      <div className={styles.controls}>
        <h1>API Reference</h1>
        <div className={styles.search}>
          <label htmlFor="api-search" aria-label="Search symbols">
            <SearchIcon />
          </label>
          <input
            id="api-search"
            placeholder="Search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
      </div>
      <div className={styles.filters}>
        <p>Filter by identifier type</p>
        <div className={styles.kinds}>
          {kinds.map((kind) => (
            <KindChip
              key={kind}
              kind={kind}
              selected={kind === selectedKind}
              onChange={(clicked) =>
                setSelectedKind((current) => toggleKind(current, clicked))
              }
            />
          ))}
        </div>
      </div>
      <hr />
      <div className={styles.packages}>
        {packages.map((pkg) => [
          <h2 key={`${pkg.packageName}-title`}>{pkg.packageName}</h2>,
          <div key={pkg.packageName} className={styles.symbols}>
            {pkg.symbols.map((symbol) => (
              <SymbolChip key={symbol.canonicalReference} symbol={symbol} />
            ))}
          </div>,
        ])}
      </div>
    </div>
  );
}
