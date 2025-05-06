import { NgClass } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'www-kind-chip',
  template: `
    <a
      class="underline"
      [class.selected]="selected()"
      (click)="onClick($event)"
    >
      <span class="kind" [ngClass]="kind()">
        {{ firstLetterOfKind() }}
      </span>
      {{ kind() }}
    </a>
  `,
  styles: [
    `
      a {
        font-family: sans-serif;
        display: flex;
        align-items: center;
        cursor: pointer;
        color: rgba(61, 60, 58, 0.72);
        transition: all 0.2s ease-in-out;
        padding: 8px 16px;
        border: 1px solid transparent;
        border-radius: 8px;

        &.selected {
          background: rgba(61, 60, 58, 0.04);
        }

        &:hover {
          border-color: rgba(61, 60, 58, 0.24);
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
  imports: [NgClass],
})
export class KindChip {
  change = output<string>();
  kind = input.required<string>();
  selected = input.required<boolean>();
  firstLetterOfKind = computed(() => this.kind().charAt(0).toUpperCase());

  onClick(event: Event) {
    event.preventDefault();
    this.change.emit(this.kind());
  }
}
