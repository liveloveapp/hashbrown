import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowUpRight } from '../icons/ArrowUpRight';
import { BrandLiveLoveApp } from '../icons/BrandLiveLoveApp';
import { CircleCheck } from '../icons/CircleCheck';
import { LiveLoveAppButton } from './LiveLoveAppButton';

@Component({
  selector: 'www-enterprise-products',
  imports: [
    ArrowUpRight,
    CircleCheck,
    RouterLink,
    BrandLiveLoveApp,
    LiveLoveAppButton,
  ],
  template: `
    <div class="bleed">
      <div class="brand">
        <www-brand-liveloveapp />
        <p>
          LiveLoveApp provides secure, compliant, and reliable long-term support
          to enterprises. We are a group of engineers who are passionate about
          open source.
        </p>
      </div>
      <www-liveloveapp-button routerLink="/enterprise">
        Enterprise Support
      </www-liveloveapp-button>
      <hr />
      <div class="info">
        <div>
          <h2>AI Engineering Sprint</h2>
          <p>
            Get your team up-to-speed on AI engineering with a one week AI
            engineering sprint. Includes a workshop on AI engineering with
            hashbrown and a few days with the hashbrown developer team to bring
            your AI ideas to life.
          </p>
        </div>
        <div>
          <h2>Long Term Support</h2>
          <p>
            Keep your hashbrown deployments running at peak performance with our
            Long Term Support. Includes an ongoing support retainer for direct
            access to the hashbrown developer team, SLA-backed issue resolution,
            and guided upgrades.
          </p>
        </div>
        <div>
          <h2>Consulting</h2>
          <p>
            LiveLoveApp provides hands-on engagement with our AI engineers for
            architecture reviews, custom integrations, proof-of-concept builds,
            performance tuning, and expert guidance on best practices.
          </p>
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

      > .brand {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 32px;
        width: 100%;

        > p {
          max-width: 480px;
          color: #5e5c5a;
          text-align: center;
          font:
            500 16px/24px Poppins,
            sans-serif;
        }
      }

      > www-liveloveapp-button {
        align-self: center;
      }

      > hr {
        width: 320px;
        height: 1px;
        background: rgba(119, 70, 37, 0.2);
      }

      > .info {
        display: grid;
        grid-template-columns: 1fr;
        gap: 32px;

        > div {
          display: flex;
          flex-direction: column;
          gap: 8px;

          > h2 {
            color: #3d3c3a;
            font:
              500 normal 18px/24px Wonder,
              sans-serif;
          }

          > p {
            color: #3d3c3a;
            font:
              400 normal 14px/18px Poppins,
              sans-serif;
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 128px 64px;

        > .info {
          grid-template-columns: repeat(3, 1fr);
        }
      }
    }
  `,
})
export class EnterpriseProducts {}
