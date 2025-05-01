import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'www-page-link',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <a
      [routerLink]="url()"
      routerLinkActive="active"
      [routerLinkActiveOptions]="{ exact: true }"
    >
      <ng-content></ng-content>
    </a>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      a {
        display: block;
        font: 400 14px/24px sans-serif;
        text-decoration-line: underline;
        text-decoration-color: transparent;
        transition: text-decoration-color 0.2s ease-in-out;

        &.active,
        &:hover {
          text-decoration-color: #2f2f2b;
        }
      }
    `,
  ],
})
export class PageLink {
  url = input.required<string>();
}
