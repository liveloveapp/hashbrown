import { Component, computed, inject, input } from '@angular/core';
import { RouterLink, UrlTree } from '@angular/router';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-next-step',
  imports: [RouterLink],
  template: `
    <li>
      <a [routerLink]="computedLink()">
        <ng-content></ng-content>
      </a>
    </li>
  `,
  styles: `
    :host {
      display: block;
    }

    li {
      display: flex;
      align-items: flex-start;
      gap: 8px;

      > a {
        display: flex;
        align-items: center;
        gap: 16px;

        > div {
          display: flex;
          flex-direction: column;
          gap: 4px;

          &:first-child {
            justify-content: center;
            align-items: center;
            padding: 8px;
            border-radius: 8px;
            background: var(--sunshine-yellow-light, #fbe7b6);
            border: 1px solid var(--sunshine-yellow-dark, #e8a23d);
          }

          &:last-child {
            > h4 {
              margin: 0;
            }

            > p {
              margin: 0;
              color: var(--gray, #5e5c5a);
              font:
                350 13px/130% 'JetBrains Mono',
                monospace;
            }
          }
        }
      }
    }
  `,
})
export class NextStep {
  config = inject(ConfigService);
  link = input<string | readonly any[] | UrlTree | null | undefined>(null);

  computedLink = computed(() => {
    const link = this.link();
    const sdk = this.config.sdk();

    // if the link is a relative path, prepend the sdk
    if (typeof link === 'string' && !link.startsWith('/')) {
      return `/docs/${sdk}/${link}`;
    }

    return link;
  });
}
