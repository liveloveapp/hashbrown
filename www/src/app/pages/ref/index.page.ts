import { Component, computed, inject, signal } from '@angular/core';
import { SymbolChip } from '../../components/SymbolChip';
import { Search } from '../../icons/Search';
import { MinimizedApiMemberSummary } from '../../models/api-report.models';
import { ReferenceService } from '../../services/ReferenceService';

@Component({
  imports: [SymbolChip, Search],
  template: `
    <div class="controls">
      <h1>API Reference</h1>
      <!--<div class="deprecated">
        <mat-slide-toggle>Hide Deprecated</mat-slide-toggle>
      </div>-->
      <div class="filter">
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
        padding: 32px;
        width: 100%;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);

        > h1 {
          font: 500 32px/40px sans-serif;
        }

        .filter {
          position: relative;

          > label {
            position: absolute;
            top: 10px;
            left: 8px;
            color: rgba(255, 255, 255, 0.54);
          }

          > input {
            background-color: transparent;
            color: white;
            font-size: 16px;
            padding: 8px 0 8px 38px;
            width: 100%;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 4px;
          }
        }
      }

      .packages {
        display: flex;
        flex-direction: column;
        gap: 32px;
        width: 100%;
        max-width: 767px;
        padding: 32px;

        > h2 {
          font: 700 14px/18px monospace;
          color: #ffd866;
          margin-top: 32px;

          &:first-child {
            margin-top: 0;
          }
        }

        > .symbols {
          width: 100%;
          padding: 0 24px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          border-left: 1px solid rgba(255, 255, 255, 0.12);
        }
      }

      @media screen and (min-width: 1024px) {
        .packages {
          max-width: 1024px;
        }
      }
    `,
  ],
})
export default class RefIndexPage {
  referenceService = inject(ReferenceService);
  searchTerm = signal<string>('');
  filteredPackages = computed(() => {
    const packageReport = this.referenceService.getMinifiedApiReport();
    const term = this.searchTerm();

    if (!packageReport) return [];

    return packageReport.packageNames.reduce(
      (packages, packageName) => {
        const pkg = packageReport.packages[packageName];
        const symbols = pkg.symbolNames.map(
          (symbolName) => pkg.symbols[symbolName],
        );
        const filteredSymbols = symbols.filter(
          (symbol) =>
            !symbol.isDeprecated &&
            (!term ||
              (term &&
                symbol.name
                  .toLocaleLowerCase()
                  .includes(term.toLocaleLowerCase()))),
        );

        return filteredSymbols.length > 0
          ? [...packages, { packageName, symbols }]
          : packages;
      },
      [] as { packageName: string; symbols: MinimizedApiMemberSummary[] }[],
    );
  });

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;

    this.searchTerm.set(input.value);
  }
}
