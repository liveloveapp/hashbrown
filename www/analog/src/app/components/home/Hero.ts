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
import { Angular as AngularIcon } from '../../icons/Angular';
import { React as ReactIcon } from '../../icons/React';

@Component({
  selector: 'www-hero',
  imports: [
    RouterLink,
    Angular,
    React,
    VideoOverlay,
    Squircle,
    AngularIcon,
    Gemini,
    Ollama,
    OpenAi,
    ReactIcon,
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
              Use
              <div class="ai-underline">LLMs</div>
              in Your Components
            </h1>
            <p>
              Hashbrown is an open-source framework for building interfaces
              powered by language models. Create components that talk, adapt,
              and predict what comes next. Craft apps that are multi-lingual,
              accessible, and joyful to use.
            </p>
          </div>
          <div class="actions">
            <!--<button
              (click)="openDemoVideo()"
              wwwSquircle="8"
              [wwwSquircleBorderWidth]="2"
              wwwSquircleBorderColor="var(--sunshine-yellow)"
              class="demo-button"
            >
              <www-player-play height="16px" width="16px" />
              Watch a Demo
            </button> -->
            <a
              [routerLink]="['/docs', 'angular', 'start', 'intro']"
              wwwSquircle="8"
              [wwwSquircleBorderWidth]="2"
              wwwSquircleBorderColor="var(--indian-red-light)"
              class="angular-docs-button"
              (click)="onOpenAngularDocs()"
            >
              <www-angular height="16px" width="16px" />
              Read Angular Docs
            </a>
            <a
              [routerLink]="['/docs', 'react', 'start', 'intro']"
              wwwSquircle="8"
              [wwwSquircleBorderWidth]="2"
              wwwSquircleBorderColor="var(--sky-blue)"
              class="react-docs-button"
              (click)="onOpenReactDocs()"
            >
              <www-react height="16px" width="16px" />
              Read React Docs
            </a>
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
      <div
        style="position: relative; padding-bottom: 64.90384615384616%; height: 0;"
        class="video"
      >
        <iframe
          src="https://www.loom.com/embed/4ac3fa6ae2a1491ab26e8bde5be13cc4?sid=896a0cbb-602e-4491-80c2-dae2c3b1aa88"
          frameborder="0"
          webkitallowfullscreen
          mozallowfullscreen
          allowfullscreen
          style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
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
            gap: 8px;
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
                width: calc(100%);
                height: 3px;
                top: -5px;
                left: 0px;
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
                500 16px/1.3em 'Fredoka',
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
              padding: 12px 16px;
              justify-content: center;
              align-items: center;
              color: rgba(0, 0, 0, 0.64);
              gap: 8px;
              font:
                700 14px/16px 'Fredoka',
                sans-serif;
            }

            > .demo-button {
              background: var(--sunshine-yellow-light);
            }

            > .angular-docs-button {
              background: #e2767652;
            }

            > .react-docs-button {
              background: var(--sky-blue-light);
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

  onOpenReactDocs() {
    this.configService.set({
      sdk: 'react',
    });
  }

  onOpenAngularDocs() {
    this.configService.set({
      sdk: 'angular',
    });
  }
}
