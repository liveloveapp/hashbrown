import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../services/ConfigService';
import { VideoOverlay } from '../VideoOverlay';
import { Squircle } from '../Squircle';
import { Angular } from './providers/Angular';
import { Gemini } from './providers/Gemini';
import { Ollama } from './providers/Ollama';
import { OpenAi } from './providers/OpenAi';
import { React } from './providers/React';
import { Writer } from './providers/Writer';

@Component({
  selector: 'www-hero',
  imports: [
    RouterLink,
    VideoOverlay,
    Squircle,
    Angular,
    Gemini,
    Ollama,
    OpenAi,
    React,
    Writer,
  ],
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
            <h1>
              Build
              <div class="ai-underline">generative</div>
              user interfaces
            </h1>
            <p>
              Hashbrown is an open-source framework for building user interfaces
              that converse with users, dynamically reorganize, and even code
              themselves.
            </p>
          </div>
          <div class="actions">
            <button (click)="openDemoVideo()" wwwSquircle="8">
              Watch a Demo
            </button>
            <a [routerLink]="docsUrl()" wwwSquircle="8">Read the Docs</a>
          </div>
          <div class="providers">
            <app-home-react></app-home-react>
            <app-home-angular></app-home-angular>
            <app-home-openai></app-home-openai>
            <app-home-gemini></app-home-gemini>
            <app-home-ollama></app-home-ollama>
            <app-home-writer></app-home-writer>
          </div>
        </div>
      </div>
    </div>
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
      gap: 128px;
      align-self: center;
      padding: 16px;

      > .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        align-self: stretch;
        width: 100%;
        max-width: 600px;
        gap: 32px;

        > .logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          img {
            width: 94px;
            height: auto;
            aspect-ratio: 47/50;
            animation: slideThenRotate 0.8s ease forwards;
            transform-origin: bottom left;
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
              color: var(--gray);
              text-align: center;
              position: relative;
              z-index: 1;
              font:
                800 32px/40px 'KefirVariable',
                sans-serif;
              font-variation-settings: 'wght' 800;
              text-shadow: 0 0 1px var(--vanilla-ivory);

              .ai-underline {
                display: inline-block;
                width: fit-content;
              }

              .ai-underline:after {
                content: '';
                position: relative;
                display: block;
                width: calc(100% - 20px);
                height: 3px;
                top: -5px;
                left: 20px;
                z-index: -1;
                background: var(--sunshine-yellow);
                border-radius: 2px;
                background: linear-gradient(
                  90deg,
                  var(--sunshine-yellow) 0%,
                  var(--sunset-orange) 25%,
                  var(--indian-red-light) 50%,
                  var(--sky-blue) 75%,
                  var(--olive-green-light) 100%
                );
                transition: width 0.5s ease;

                @starting-style {
                  width: 0;
                }
              }
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

          > .providers {
            display: flex;
            gap: 16px;
            justify-content: center;
            align-items: center;
            align-self: stretch;
            margin-top: 16px;
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 96px 64px;
        gap: 192px;

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

    @keyframes slideThenRotate {
      0% {
        opacity: 0;
        transform: rotate(-10deg) translateX(-90px) translateY(0px);
      }
      70% {
        opacity: 1;
        transform: rotate(-10deg) translateX(0px) translateY(4px);
      }
      100% {
        transform: rotate(0deg) translateX(0px) translateY(0px);
      }
    }
  `,
})
export class Hero {
  demoVideoOpen = signal(false);

  configService = inject(ConfigService);
  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/intro`;
  });

  openDemoVideo() {
    this.demoVideoOpen.set(true);
  }
}
