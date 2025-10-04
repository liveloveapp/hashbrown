import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Sell } from '../icons/Sell';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-courses-menu',
  imports: [Sell, RouterLink, Squircle],
  template: `
    <div class="course">
      <a routerLink="react-generative-ui-engineering">
        Building Generative UIs with React
      </a>
      <ul>
        <li><span>October 13</span> <span>11 am to 6 pm ET</span></li>
      </ul>
      <span class="price">
        <www-sell height="14px" width="14px" stroke="#E88C4D" fill="#E88C4D" />
        $350 per person. Group discounts available.
      </span>
      <div class="action">
        <a
          href="https://ti.to/liveloveapp/hashbrown-react-sep-2025"
          target="_blank"
          wwwSquircle="8"
        >
          Reserve to Attend Online</a
        >
      </div>
    </div>
    <div class="course">
      <a routerLink="angular-generative-ui-engineering"
        >Building Generative UIs with Angular</a
      >
      <ul>
        <li><span>October 14</span> <span>11 am to 6 pm ET</span></li>
      </ul>
      <span class="price">
        <www-sell height="14px" width="14px" stroke="#E88C4D" fill="#E88C4D" />
        $350 per person. Group discounts available.
      </span>
      <div class="action">
        <a
          href="https://ti.to/liveloveapp/hashbrown-angular-sep-2025"
          target="_blank"
          wwwSquircle="8"
        >
          Reserve to Attend Online</a
        >
      </div>
    </div>
    <div class="contact-us">
      <h2>Contact Sales</h2>
      <p>
        Looking for a custom workshop for your team? Want us to come to your
        location?
      </p>
      <a
        routerLink="/contact-us"
        wwwSquircle="8"
        [wwwSquircleBorderWidth]="1"
        wwwSquircleBorderColor="var(--sky-blue, #9ecfd7)"
        >Contact Sales</a
      >
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    .course {
      display: flex;
      flex-direction: column;
      gap: 4px;

      > a {
        color: var(--gray, #3d3c3a);
        font:
          800 17px / 25px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 800;
      }

      > ul {
        display: flex;
        flex-direction: column;
        gap: 4px;

        > li {
          display: flex;
          justify-content: space-between;
          color: var(--gray, #3d3c3a);
          font:
            400 16px / 24px 'Fredoka',
            sans-serif;
        }
      }

      > .price {
        display: flex;
        gap: 4px;
        color: var(--gray, #3d3c3a);
        font:
          400 14px / 20px 'Fredoka',
          sans-serif;
      }

      > .action {
        display: flex;
        justify-content: stretch;
        margin-top: 8px;

        > a {
          width: 100%;
          display: flex;
          padding: 12px 24px;
          justify-content: center;
          align-items: center;
          color: rgba(0, 0, 0, 0.64);
          background: var(--sunshine-yellow-light, #fde4ba);
          font:
            400 16px/18px 'Fredoka',
            sans-serif;
        }
      }
    }

    .contact-us {
      display: flex;
      flex-direction: column;
      gap: 8px;

      > h2 {
        color: var(--gray, #3d3c3a);
        font:
          800 17px / 25px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 800;
      }

      > p {
        color: var(--gray, #3d3c3a);
        font:
          400 16px / 24px 'Fredoka',
          sans-serif;
      }

      > a {
        width: 100%;
        display: flex;
        padding: 12px 24px;
        justify-content: center;
        align-items: center;
        background: var(--sky-blue-light, #9ecfd7);
        color: rgba(0, 0, 0, 0.64);
        font:
          400 16px/18px 'Fredoka',
          sans-serif;
      }
    }
  `,
})
export class CoursesMenu {}
