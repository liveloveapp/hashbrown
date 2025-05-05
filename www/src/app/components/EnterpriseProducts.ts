import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowUpRight } from '../icons/ArrowUpRight';
import { BrainComponent } from './Brain';

@Component({
  selector: 'www-enterprise-products',
  imports: [BrainComponent, ArrowUpRight, RouterLink],
  template: `
    <div class="bleed">
      <www-brain />
      <div class="info">
        <h2>AI does that</h2>
        <p>
          We can't stop thinking about how AI changes the way people explore,
          visualize, and act on complex information - all through the power of
          natural language.
        </p>
        <span class="gap"></span>
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
      background: rgba(47, 47, 43, 0.04);
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
      background: #fff;
      border-radius: 12px;
      padding: 48px 32px;
      display: flex;
      flex-direction: column;
      gap: 32px;

      > h2 {
        font: 32px/48px sans-serif;
      }

      > .gap {
        flex: 1 auto;
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
