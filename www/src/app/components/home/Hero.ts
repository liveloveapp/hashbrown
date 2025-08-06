import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../services/ConfigService';
import { VideoOverlay } from '../VideoOverlay';
import { Squircle } from '../Squircle';

@Component({
  selector: 'www-hero',
  imports: [RouterLink, VideoOverlay, Squircle],
  template: `
    <div class="bleed">
      <div class="hero">
        <div class="logo">
          <img
            src="/image/logo/brand-mark-alt.svg"
            alt="our friendly logo that looks like a hashbrown character from an animated tv show"
          />
        </div>
        <div class="container">
          <div class="heading">
            <h1>Build user interfaces that delight users with intelligence</h1>
            <p>
              Hashbrown is an open-source framework for building generative user
              interfaces that speed users through workflows, simplify data
              entry, dynamically reorganize, and even code themselves.
            </p>
          </div>
          <div class="actions">
            <button (click)="openDemoVideo()" wwwSquircle="8">
              Watch a Demo
            </button>
            <a [routerLink]="docsUrl()" wwwSquircle="8">Read the Docs</a>
          </div>
        </div>
      </div>
      <div class="news">
        <div
          class="alert"
          wwwSquircle="8"
          [wwwSquircleBorderWidth]="1"
          [wwwSquircleBorderColor]="'var(--sunshine-yellow-dark)'"
        >
          <p>
            <strong>New!</strong> Workshop tickets for
            <a routerLink="/products/workshops"
              >Build Generative UIs in React</a
            >
            are on sale now.
          </p>
        </div>
      </div>
    </div>
    <div class="gradient"></div>
    <www-video-overlay
      [open]="demoVideoOpen()"
      (closed)="demoVideoOpen.set(false)"
    >
      <div style="padding:64.9% 0 0 0;position:relative;" class="video">
        <iframe
          src="https://player.vimeo.com/video/1088958585?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"
          frameborder="0"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
          style="position:absolute;top:0;left:0;width:100%;height:100%;"
          title="Introducing Hashbrown"
        ></iframe>
      </div>
    </www-video-overlay>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      gap: 192px;
      align-self: center;
      padding: 32px;

      > .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        align-self: stretch;
        width: 100%;
        max-width: 600px;

        > .logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          img {
            width: 94px;
            height: auto;
            aspect-ratio: 47/50;
          }
        }

        > .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
          align-self: stretch;

          > .heading {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            align-self: stretch;

            > h1 {
              color: var(--gray-dark, #3d3c3a);
              text-align: center;
              font:
                900 32px/40px 'KefirVariable',
                sans-serif;
              font-variation-settings: 'wght' 900;
            }

            > p {
              color: var(--gray, #5e5c5a);
              text-align: center;
              font:
                500 18px/24px 'Fredoka',
                sans-serif;
            }

            a {
              display: flex;
              justify-content: center;
              align-items: center;
              align-self: flex-start;
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
          }

          > .actions {
            display: flex;
            gap: 8px;
            justify-content: center;
            align-items: center;
            align-self: stretch;

            > button,
            > a {
              display: flex;
              padding: 12px 24px;
              justify-content: center;
              align-items: center;
              color: rgba(0, 0, 0, 0.64);
              font:
                700 14px/16px 'Fredoka',
                sans-serif;
            }

            > button {
              background: var(--sunshine-yellow, #fbbb52);
            }

            > a {
              background: #e1e1e1;
            }
          }
        }
      }

      .news {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        max-width: 800px;

        > .alert {
          display: flex;
          padding: 11px 24px 12px 24px;
          justify-content: center;
          align-items: center;
          background: rgba(251, 187, 82, 0.24);

          > p {
            color: rgba(0, 0, 0, 0.64);
            text-align: center;
            font:
              400 13px/140% 'Fredoka',
              sans-serif;

            > strong {
              font-weight: 700;
            }

            > a {
              text-decoration: underline;
              text-decoration-style: solid;
              text-decoration-thickness: 1px;
              transition: text-decoration-thickness 0.2s ease-in-out;

              &:hover {
                text-decoration-thickness: 2px;
              }
            }
          }
        }
      }
    }

    .gradient {
      height: 32px;
      width: 100%;
      background: linear-gradient(
        to right,
        #fbbb52 0%,
        var(--sunset-orange) 25%,
        var(--indian-red-light) 50%,
        var(--sky-blue-dark) 75%,
        var(--olive-green-light) 100%
      );
      background-clip: border-box;
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 96px 64px;

        > .hero {
          > .logo {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;

            img {
              width: 148px;
              height: auto;
              aspect-ratio: 47/50;
            }
          }
        }
      }
    }
  `,
})
export class Hero {
  demoVideoOpen = signal(false);

  configService = inject(ConfigService);
  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/quick`;
  });

  openDemoVideo() {
    this.demoVideoOpen.set(true);
  }
}
