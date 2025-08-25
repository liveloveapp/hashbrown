import { Component, computed, inject, signal } from '@angular/core';
import { KindChip } from '../../components/KindChip';
import { SymbolChip } from '../../components/SymbolChip';
import { Search } from '../../icons/Search';
import { MinimizedApiMemberSummary } from '../../models/api-report.models';
import { ApiService } from '../../services/ApiService';

@Component({
  imports: [SymbolChip, Search, KindChip],
  template: `
    <div class="controls">
      <h1>API Reference</h1>
      <!--<div class="deprecated">
        <mat-slide-toggle>Hide Deprecated</mat-slide-toggle>
      </div>-->
      <div class="search">
        <label>
          <www-search height="16px" width="16px" />
        </label>
        <input
          placeholder="Search"
          [value]="searchTerm()"
          (input)="onSearch($event)"
        />
      </div>
    </div>
    <div class="filters">
      <p>Filter by identifier type</p>
      <div class="kinds">
        @for (kind of kinds(); track kind) {
          <www-kind-chip
            [kind]="kind"
            [selected]="kind === selectedKind()"
            (change)="onFilterKind($event)"
          />
        }
      </div>
    </div>
    <hr />
    <div class="packages">
      @for (pkg of filteredPackages(); track pkg.packageName) {
        <h2>{{ pkg.packageName }}</h2>
        <div class="symbols">
          @for (symbol of pkg.symbols; track symbol.canonicalReference) {
            <www-symbol-chip [symbol]="symbol" />
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 auto;
      }

      .controls {
        display: flex;
        align-items: flex-end;
        padding: 24px;
        width: 100%;
        justify-content: space-between;

        > h1 {
          color: var(--gray, #5e5c5a);
          font:
            750 22px/32px KefirVariable,
            sans-serif;
          font-variation-settings: 'wght' 750;

          &:first-child {
            margin-top: 0;
          }
        }

        > .search {
          position: relative;

          > label {
            position: absolute;
            top: 10px;
            left: 8px;
          }

          > input {
            background-color: transparent;
            font-size: 16px;
            padding: 8px 0 8px 38px;
            width: 100%;
            border: 1px solid rgba(61, 60, 58, 0.24);
            border-radius: 8px;
          }
        }
      }

      .filters {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px;

        .kinds {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
      }

      hr {
        border: 0;
        border-top: 1px solid rgba(61, 60, 58, 0.24);
        margin: 32px 32px;
      }

      .packages {
        display: flex;
        flex-direction: column;
        gap: 32px;
        width: 100%;
        max-width: 767px;
        padding: 24px;

        > h2 {
          font:
            700 14px/18px 'JetBrains Mono',
            monospace;
          color: #774625;
          margin-top: 32px;

          &:first-child {
            margin-top: 0;
          }
        }

        > .symbols {
          width: 100%;
          padding: 0 24px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          border-left: 1px solid rgba(255, 255, 255, 0.12);
        }
      }

      @media screen and (min-width: 768px) {
        .packages {
          > .symbols {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      }

      @media screen and (min-width: 1281px) {
        .packages {
          max-width: 1024px;

          > .symbols {
            border-left: 1px solid rgba(255, 255, 255, 0.12);
            grid-template-columns: repeat(3, 1fr);
          }
        }
      }
    `,
  ],
})
export default class ApiIndexPage {
  apiService = inject(ApiService);
  selectedKind = signal<string>('');
  searchTerm = signal<string>('');
  filteredPackages = computed(() => {
    const packageReport = this.apiService.getMinifiedApiReport();
    const term = this.searchTerm();
    const selectedKind = this.selectedKind();

    if (!packageReport) return [];

    return packageReport.packageNames.reduce(
      (packages, packageName) => {
        const pkg = packageReport.packages[packageName];
        const symbols = pkg.symbolNames.map(
          (symbolName) => pkg.symbols[symbolName],
        );
        const filteredSymbols = symbols
          .filter((symbol) => {
            return !selectedKind || symbol.kind === selectedKind;
          })
          .filter((symbol) => {
            const matchesTerm =
              !term ||
              symbol.name
                .toLocaleLowerCase()
                .includes(term.toLocaleLowerCase());
            return !symbol.isDeprecated && matchesTerm;
          });

        return filteredSymbols.length > 0
          ? [...packages, { packageName, symbols: filteredSymbols }]
          : packages;
      },
      [] as { packageName: string; symbols: MinimizedApiMemberSummary[] }[],
    );
  });

  kinds = computed(() => {
    const packageReport = this.apiService.getMinifiedApiReport();
    if (!packageReport) return [];

    const uniqueKinds = Object.values(packageReport.packages).reduce(
      (prev, pkg) => {
        return Object.values(pkg.symbols).reduce((kinds, summary) => {
          if (summary.kind && !kinds.has(summary.kind)) {
            kinds.add(summary.kind);
          }
          return kinds;
        }, prev);
      },
      new Set<string>(),
    );

    return Array.from(uniqueKinds);
  });

  onFilterKind(kind: string) {
    if (this.selectedKind() === kind) {
      this.selectedKind.set('');
      return;
    }
    this.selectedKind.set(kind);
  }

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
  }
}
