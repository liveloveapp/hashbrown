import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Hashbrown } from '../icons/Hashbrown';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-hero',
  imports: [RouterLink, Hashbrown],
  template: `
    <div class="bleed">
      <div class="container">
        <div class="logo">
          <img
            src="/logo/hashbrown.png"
            alt="our friendly logo that looks like a hashbrown character from an animated tv show"
            height="136"
            width="134"
          />
          <www-hashbrown />
          <p>
            a framework for building joyful,<br />AI-powered user experiences
          </p>
        </div>
        <div class="cta">
          <a [routerLink]="docsUrl()"> read the documentation </a>
          <p>100% free, open-source, and MIT-Licensed</p>
          <iframe
            src="https://ghbtns.com/github-btn.html?user=liveloveapp&repo=hashbrown&type=star&count=true&size=large"
            frameborder="0"
            scrolling="0"
            width="120"
            height="30"
            title="GitHub"
          ></iframe>
        </div>
      </div>
    </div>
    <div class="divider-1"></div>
    <div class="divider-2"></div>
    <div class="divider-3"></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #fbbb52;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      padding: 64px 32px;
      width: 100%;
      max-width: 1024px;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;

      > .logo {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;

        > p {
          color: #3d3c3a;
          font:
            400 24px/28px Poppins,
            sans-serif;
          text-align: center;
        }
      }

      > .cta {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;

        a {
          display: flex;
          justify-content: center;
          align-items: center;
          color: rgba(255, 255, 255, 0.88);
          font:
            500 18px/24px 'Fredoka',
            sans-serif;
          padding: 12px 24px;
          border-radius: 48px;
          border: 6px solid #e8a23d;
          background: #e88c4d;
          transition:
            color 0.2s ease-in-out,
            border 0.2s ease-in-out;

          &:hover {
            color: #fff;
          }
        }

        > p {
          color: #774625;
          font:
            700 10px/16px Poppins,
            sans-serif;
          text-align: center;
        }
      }
    }

    .divider-1,
    .divider-2,
    .divider-3 {
      width: 100%;
      height: 12px;
    }

    .divider-1 {
      background: #e88c4d;
    }

    .divider-2 {
      background: #b86060;
    }

    .divider-3 {
      background: #9ecfd7;
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 128px 64px;
      }
    }
  `,
})
export class Hero {
  configService = inject(ConfigService);
  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/quick`;
  });
}
