import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Header } from '../components/Header';
import { Squircle } from '../components/Squircle';
import { Sell } from '../icons/Sell';
import { Footer } from '../components/Footer';

@Component({
  imports: [Sell, RouterOutlet, Header, Squircle, RouterLink, Footer],
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
              <li><span>October 13</span> <span>11 am to 6 pm ET</span></li>
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
              <li><span>October 14</span> <span>11 am to 6 pm ET</span></li>
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
              <li><span>September 23</span> <span>11 am to 6 pm ET</span></li>
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
                href="https://ti.to/liveloveapp/mcp-fundamentals-sep-2025"
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
              Looking for a custom workshop for your team? Want us to come to
              your location?
            </p>
            <a
              routerLink="/contact-us"
              wwwSquircle="8"
              [wwwSquircleBorderWidth]="1"
              wwwSquircleBorderColor="var(--sky-blue, #9ecfd7)"
              >Contact Sales</a
            >
          </div>
        </div>
      </div>
    </main>
    <www-footer />
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
      margin: 0 auto 48px;

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

        > .contact-us {
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
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        grid-template-columns: 1fr 316px;
        gap: 64px;
        max-width: 1024px;
      }
    }

    @media screen and (min-width: 1281px) {
      .bleed {
        grid-template-columns: 1fr 316px;
        gap: 80px;
        max-width: 1281px;
      }
    }
  `,
})
export default class WorkshopsPage {}
