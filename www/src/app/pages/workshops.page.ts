import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Header } from '../components/Header';
import { Squircle } from '../components/Squircle';
import { Sell } from '../icons/Sell';

@Component({
  imports: [Sell, RouterOutlet, Header, Squircle, RouterLink],
  template: `
    <www-header />
    <main>
      <div class="bleed">
        <div><router-outlet></router-outlet></div>
        <div class="courses">
          <div class="course">
            <a routerLink="react-generative-ui-engineering">
              React: Generative UI Engineering
            </a>
            <ul>
              <li><span>September 8</span> <span>11 am to 6 pm ET</span></li>
              <li><span>September 15</span> <span>11 am to 6 pm ET</span></li>
            </ul>
            <span class="price">
              <www-sell
                height="14px"
                width="14px"
                stroke="#E88C4D"
                fill="#E88C4D"
              />
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
              >Angular: Generative UI Engineering</a
            >
            <ul>
              <li><span>September 9</span> <span>11 am to 6 pm ET</span></li>
              <li><span>September 16</span> <span>11 am to 6 pm ET</span></li>
            </ul>
            <span class="price">
              <www-sell
                height="14px"
                width="14px"
                stroke="#E88C4D"
                fill="#E88C4D"
              />
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
          <div class="course">
            <a routerLink="mcp-fundamentals">MCP Fundamentals</a>
            <ul>
              <li><span>September 10</span> <span>11 am to 6 pm ET</span></li>
              <li><span>September 17</span> <span>11 am to 6 pm ET</span></li>
            </ul>
            <span class="price">
              <www-sell
                height="14px"
                width="14px"
                stroke="#E88C4D"
                fill="#E88C4D"
              />
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
        </div>
      </div>
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      background-color: var(--vanilla-ivory, #faf9f0);
      background-image: url('/image/texture/fabric.png');
      background-size: auto;
      background-repeat: repeat;
      background-position: center;
      background-attachment: fixed;
    }

    .bleed {
      display: grid;
      grid-template-columns: 1fr;
      gap: 32px;
      padding: 24px;
      margin: 0 auto;

      > .courses {
        position: sticky;
        top: 154px;
        display: flex;
        flex-direction: column;
        gap: 32px;

        > .course {
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
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        grid-template-columns: 1fr 316px;
        gap: 64px;
        max-width: 800px;
      }
    }

    @media screen and (min-width: 1281px) {
      .bleed {
        grid-template-columns: 1fr 316px;
        gap: 80px;
        max-width: 1024px;
      }
    }
  `,
})
export default class WorkshopsPage {}
