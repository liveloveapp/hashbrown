import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowUpRight } from '../icons/ArrowUpRight';
import { CircleCheck } from '../icons/CircleCheck';
import { BrainComponent } from './Brain';

@Component({
  selector: 'www-enterprise-products',
  imports: [BrainComponent, ArrowUpRight, CircleCheck, RouterLink],
  template: `
    <div class="bleed">
      <www-brain />
      <div class="info">
        <h2><span>Enterprise support</span><span>by LiveLoveApp</span></h2>
        <p>
          We can't stop thinking about how AI changes the way people explore,
          visualize, and act on complex information - all through the power of
          natural language.
        </p>
        <ul>
          <li>
            <www-circle-check />
            <strong>AI Engineering</strong>
            <div></div>
            <p>
              From concept to launch, our engineering approach is fast and
              high-quality. We can deliver top-tier AI engineering for your
              product.
            </p>
          </li>
          <li>
            <www-circle-check />
            <strong>Workshops</strong>
            <div></div>
            <p>
              Learn how to build and deploy AI into your organization's web app
              with our hands-on workshops.
            </p>
          </li>
          <li>
            <www-circle-check />
            <strong>Design</strong>
            <div></div>
            <p>
              Turn massive data into actionable insights. We understand big
              data, and how best to communicate data visually.
            </p>
          </li>
        </ul>
        <a routerLink="/enterprise">
          Enterprise Services <www-arrow-up-right />
        </a>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      background: #faf9f0;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      padding: 128px 64px;
      max-width: 1024px;
    }

    www-brain {
      display: none;
    }

    .info {
      display: flex;
      flex-direction: column;
      gap: 32px;

      > h2 {
        display: flex;
        flex-direction: column;
        gap: 8px;
        color: #5e5c5a;
        font: 400 32px/40px sans-serif;
      }

      > p {
        color: #774625;
        font: 500 16px/24px sans-serif;
      }

      > ul {
        display: flex;
        flex-direction: column;
        gap: 16px;
        color: #774625;
        font: 500 16px/24px sans-serif;

        > li {
          display: grid;
          grid-template-columns: 24px auto;
          row-gap: 8px;
          column-gap: 16px;
          align-items: center;

          > strong {
            font: 700 16px/24px sans-serif;
          }

          > p {
            font: 400 14px/18px sans-serif;
          }
        }
      }

      > a {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        color: rgba(125, 84, 47, 0.88);
        text-transform: uppercase;
        font: 600 12px/16px sans-serif;
        padding: 12px 24px;
        border: 2px solid rgba(125, 84, 47, 0.56);
        border-radius: 9999px;
        transition:
          color 0.2s ease-in-out,
          border 0.2s ease-in-out;

        &:hover {
          color: rgb(125, 84, 47);
          border-color: rgb(125, 84, 47);
        }
      }
    }

    @media screen and (min-width: 1024px) {
      www-brain {
        display: block;
      }

      .bleed {
        flex-direction: row;
        gap: 64px;
      }
    }

    @media screen and (min-width: 1281px) {
      .bleed {
        gap: 128px;
      }
    }
  `,
})
export class EnterpriseProducts {}
