import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../services/ConfigService';
import { Squircle } from '../Squircle';
import { Gemini } from './providers/Gemini';
import { Ollama } from './providers/Ollama';
import { OpenAi } from './providers/OpenAi';
import { Writer } from './providers/Writer';
import { Anthropic } from './providers/Anthropic';
import { Bedrock } from './providers/Bedrock';
import { Angular as AngularIcon } from '../../icons/Angular';
import { React as ReactIcon } from '../../icons/React';
import { Scene } from '../hashy-skates/Scene';

@Component({
  selector: 'www-hero',
  imports: [
    RouterLink,
    Squircle,
    AngularIcon,
    Gemini,
    Ollama,
    OpenAi,
    ReactIcon,
    Writer,
    Scene,
    Anthropic,
    Bedrock,
  ],
  template: `
    <div class="hero">
      <div class="container">
        <div class="heading">
          <h1>
            Build agents that run
            <div class="ai-underline">in the browser</div>
          </h1>
          <p>
            Embed intelligence into your product's user experience by
            integrating LLMs with your UI components and client-side logic.
          </p>
          <p>Intelligence where it helps. Nowhere it doesn't.</p>
        </div>
        <div class="actions">
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
          <app-home-openai class="provider"></app-home-openai>
          <app-home-gemini class="provider"></app-home-gemini>
          <app-home-ollama class="provider"></app-home-ollama>
          <app-home-writer class="provider"></app-home-writer>
          <app-home-anthropic class="provider"></app-home-anthropic>
          <app-home-bedrock class="provider"></app-home-bedrock>
        </div>
      </div>
      @defer (on immediate) {
        <www-hashy-skates-scene />
      } @placeholder {
        <div class="hashy-skates-placeholder"></div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .hero {
      display: grid;
      grid-template-columns: 1fr 566px;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: 1080px;
      gap: 32px;

      www-hashy-skates-scene {
        width: 566px;
        max-width: 100%;
        height: auto;
        transition: opacity 750ms;

        @starting-style {
          opacity: 0;
        }
      }

      .hashy-skates-placeholder {
        width: 566px;
        max-width: 100%;
        aspect-ratio: 566 / 572;
        height: auto;
      }

      > .container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;

        > .heading {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-self: stretch;
          max-width: 500px;

          > h1 {
            color: var(--gray);
            position: relative;
            z-index: 1;
            font:
              700 40px/52px 'KefirVariable',
              sans-serif;
            font-variation-settings: 'wght' 700;
            text-shadow: 0 0 1px var(--vanilla-ivory);
            opacity: 1;
            transition: opacity 750ms;

            @starting-style {
              opacity: 0;
            }

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
              transition-delay: 350ms;

              @starting-style {
                width: 0;
              }
            }
          }

          > p {
            color: var(--gray, #5e5c5a);
            font:
              500 16px/1.3em 'Fredoka',
              sans-serif;
            opacity: 1;
            transition: opacity 1250ms;

            @starting-style {
              opacity: 0;
            }
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
          align-self: stretch;

          > button,
          > a {
            display: flex;
            padding: 12px 16px 12px 12px;
            color: rgba(0, 0, 0, 0.64);
            gap: 8px;
            font:
              700 14px/16px 'Fredoka',
              sans-serif;
            opacity: 0.8;
            transition: opacity 1250ms;

            @starting-style {
              opacity: 0;
            }

            &:hover {
              opacity: 1;
            }
          }

          > .demo-button {
            background: var(--sunshine-yellow-light);
          }

          > .angular-docs-button {
            background: #e2767652;
          }

          > .react-docs-button {
            background: var(--sky-blue-light);
            transition-delay: 180ms;
          }
        }

        > .providers {
          display: flex;
          gap: 16px;
          align-self: stretch;
          margin-top: 16px;
          transform: scale(0.75);
          transform-origin: top left;

          .provider {
            opacity: 1;
            transition:
              opacity 1250ms,
              transform 1250ms;

            @starting-style {
              opacity: 0;
              transform: translateX(0px);
            }
          }

          .provider:nth-child(1) {
            transition-delay: 0;
          }

          .provider:nth-child(2) {
            transition-delay: 100ms;
          }

          .provider:nth-child(3) {
            transition-delay: 200ms;
          }

          .provider:nth-child(4) {
            transition-delay: 300ms;
          }

          .provider:nth-child(5) {
            transition-delay: 400ms;
          }

          .provider:nth-child(6) {
            transition-delay: 500ms;
          }
        }
      }
    }

    @media screen and (max-width: 1024px) {
      .hero {
        grid-template-columns: 500px 1fr;
        padding: 48px 24px 24px;
        max-width: 100vw;
        gap: 0;

        www-hashy-skates-scene {
          width: auto;
          max-width: 420px;
        }

        .hashy-skates-placeholder {
          width: auto;
          max-width: 420px;
        }
      }
    }

    @media screen and (max-width: 700px) {
      .hero {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr auto;
        padding: 0 24px;
        align-items: center;
        max-width: 100vw;
        gap: 0;

        www-hashy-skates-scene {
          width: auto;
          max-width: 420px;
        }

        .hashy-skates-placeholder {
          width: auto;
          max-width: 420px;
        }

        > .container {
          order: 2;

          > .heading > h1 {
            font:
              700 34px/46px 'KefirVariable',
              sans-serif;
            font-variation-settings: 'wght' 700;
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
