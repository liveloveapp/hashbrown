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
        color: rgba(255, 255, 255, 0.56);
        transition: color 0.2s;
        font-size: 14px;
      }

      a.active,
      a:hover {
        color: rgba(255, 255, 255, 0.87);
      }
    `,
  ],
})
export class PageLink {
  url = input.required<string>();
}
