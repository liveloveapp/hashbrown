import { NgClass } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  MinimizedApiMemberSummary,
  ParsedCanonicalReference,
} from '../models/api-report.models';

@Component({
  selector: 'www-symbol-chip',
  template: `
    <a [routerLink]="url()" class="underline">
      <span class="kind" [ngClass]="kind()">{{ firstLetterOfKind() }}</span>
      {{ symbol().name }}
    </a>
  `,
  styles: [
    `
      a {
        font-family: sans-serif;
        display: flex;
        align-items: center;
        cursor: pointer;
        color: rgba(47, 47, 43, 0.72);
        transition: all 0.2s ease-in-out;

        &:hover {
          color: rgb(47, 47, 43);
        }
      }

      span {
        display: inline-block;
        width: 1.5em;
        text-align: center;
        margin: 0 0.5em 0 0;
        border-radius: 2px;
        font-weight: bold;
        font-size: 12px;
      }
    `,
  ],
  imports: [RouterLink, NgClass],
})
export class SymbolChip {
  symbol = input.required<MinimizedApiMemberSummary>();
  kind = computed(() => this.symbol().kind);
  firstLetterOfKind = computed(() => this.kind().charAt(0).toUpperCase());
  parsedReference = computed(
    () => new ParsedCanonicalReference(this.symbol().canonicalReference),
  );
  url = computed(() => {
    const [hashbrownai, ...rest] = this.parsedReference().package.split('/');
    return `/api/${rest.join('/')}/${this.parsedReference().name}`;
  });
}
