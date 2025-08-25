import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Check } from '../icons/Check';

@Component({
  selector: 'www-products',
  imports: [RouterLink, Check],
  template: `
    <div class="bleed">
      <div class="products">
        <div class="product">
          <div class="title">
            <h2>AI Sprint</h2>
            <p>1-week sprint</p>
          </div>
          <div class="details">
            <ul>
              <li><www-check />1 day AI engineering workshop</li>
              <li><www-check />1 day hashbrown workshop</li>
              <li><www-check />32 hours to bring your AI idea to life</li>
            </ul>
          </div>
          <div class="action">
            <a routerLink="/products/ai-engineering-sprint">Learn more</a>
          </div>
        </div>
        <div class="product">
          <div class="title">
            <h2>Workshops</h2>
            <p>1-day workshops</p>
          </div>
          <div class="details">
            <ul>
              <li><www-check />Learn the fundamentals of AI Engineering</li>
              <li>
                <www-check />Learn how to build intelligent Angular and React
                applications using hashbrown
              </li>
              <li>
                <www-check />Learn how to build generative user interfaces
              </li>
            </ul>
          </div>
          <div class="action">
            <a routerLink="/products/workshops">Learn more</a>
          </div>
        </div>
        <div class="product">
          <div class="title">
            <h2>Consulting</h2>
            <p>Customized engagements</p>
          </div>
          <div class="details">
            <ul>
              <li><www-check />Architecture reviews</li>
              <li><www-check />Custom integrations</li>
              <li><www-check />Proof-of-concept builds</li>
              <li><www-check />Performance tuning</li>
              <li><www-check />Expert guidance on best practices</li>
            </ul>
          </div>
          <div class="action">
            <a routerLink="/products/consulting" class="cta">Contact Us</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      background: #f9f4f2;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      gap: 56px;
      padding: 64px 32px;
      width: 100%;
      max-width: 1024px;

      > .products {
        display: grid;
        grid-template-columns: 1fr;
        border-top: 1px solid rgba(61, 60, 58, 0.24);
        border-bottom: 1px solid rgba(61, 60, 58, 0.24);

        > .product {
          display: flex;
          flex-direction: column;
          gap: 8px;

          > .title {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 32px;
            border-bottom: 1px solid rgba(61, 60, 58, 0.24);

            > h2 {
              color: #3d3c3a;
              font:
                400 24px/32px 'KefirVariable',
                sans-serif;
              font-variation-settings: 'wght' 400;
            }

            > p {
              color: #5e5c5a;
              font:
                400 normal 16px/24px Fredoka,
                sans-serif;
            }
          }

          > .details {
            flex: 1 auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 32px;

            > p {
              color: #3d3c3a;
              font:
                400 normal 14px/18px Poppins,
                sans-serif;
            }

            > ul {
              display: flex;
              flex-direction: column;
              gap: 16px;

              > li {
                display: flex;
                gap: 8px;
                font:
                  300 normal 14px/20px Fredoka,
                  sans-serif;
              }
            }
          }

          > .action {
            display: flex;
            justify-content: center;
            padding: 32px;

            > a {
              display: flex;
              padding: 12px 24px;
              justify-content: center;
              align-items: center;
              border-radius: 8px;
              color: rgba(0, 0, 0, 0.64);
              background: #e1e1e1;
              font:
                700 14px/16px 'Fredoka',
                sans-serif;

              &.cta {
                background: var(--sunshine-yellow, #fbbb52);
              }
            }
          }
        }

        > div:not(:nth-child(3n)) {
          border-right: 1px solid rgba(61, 60, 58, 0.24);
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 128px 64px;

        > .products {
          grid-template-columns: repeat(3, 1fr);
        }
      }
    }
  `,
})
export class Products {}
