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
      <span [ngClass]="kind()">{{ firstLetterOfKind() }}</span>
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
        color: rgba(255, 255, 255, 0.72);
        transition: all 0.2s ease-in-out;

        &:hover {
          color: rgba(255, 255, 255, 1);
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

      .EntryPoint {
        background-color: #f8d7da;
        color: #721c24;
      }

      .Function {
        background-color: #d4edda;
        color: #155724;
      }

      .Class {
        background-color: #cce5ff;
        color: #004085;
      }

      .TypeAlias {
        background-color: #fff3cd;
        color: #856404;
      }

      .Interface {
        background-color: #d1ecf1;
        color: #0c5460;
      }

      .Enum {
        background-color: #f8d7da;
        color: #721c24;
      }

      .Variable {
        background-color: #f8d7da;
        color: #721c24;
      }

      .Property {
        background-color: #f8d7da;
        color: #721c24;
      }

      .Method {
        background-color: #d4edda;
        color: #155724;
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
    return `/ref/${rest.join('/')}/${this.parsedReference().name}`;
  });
}
