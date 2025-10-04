import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'www-liveloveapp-button',
  imports: [RouterLink],
  template: `
    <a [routerLink]="routerLink()">
      <ng-content />
    </a>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }

    a {
      display: inline-flex;
      align-items: center;
      text-decoration: none;

      font:
        500 16px/18px Fredoka,
        sans-serif;
      padding: 16px 32px;
      border-radius: 32px;
      color: #fff;
      box-shadow: 0px 4px 16px 2px rgba(0, 0, 0, 0.12);
      text-shadow: 0 0 4px rgba(0, 0, 0, 0.12);
      transition: all 200ms;
      background: linear-gradient(270deg, #6cafe4, #ed8390);
      background-size: 400% 400%;
      animation: Shimmer 20s ease infinite;

      &:hover {
        box-shadow: 0 6px 14px 2px rgba(0, 0, 0, 0.24);
        transform: scale(1.04);
        animation-duration: 2s;
      }
    }

    @keyframes Shimmer {
      0% {
        background-position: 20% 50%;
      }
      50% {
        background-position: 80% 50%;
      }
      100% {
        background-position: 20% 50%;
      }
    }
  `,
})
export class LiveLoveAppButton {
  routerLink = input<string>('');
}
