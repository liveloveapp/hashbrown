/// <reference types="vite/client" />

import { Component, computed, inject, signal, Type } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Angular } from '../../icons/Angular';
import { BrandGoogle } from '../../icons/BrandGoogle';
import { BrandOpenAi } from '../../icons/BrandOpenAi';
import { BrandWriter } from '../../icons/BrandWriter';
import { React } from '../../icons/React';
import { AppConfig, ConfigService } from '../../services/ConfigService';
import { CodeExampleGroup } from '../CodeExampleGroup';
import { CodeExampleGroupItem } from '../CodeExampleGroupItem';
import { Squircle } from '../Squircle';
import { DropdownMenu } from '../DropDownMenu';
import { ChevronDown } from '../../icons/ChevronDown';

interface Example {
  file: string;
  value: string;
}

function exampleReducer(
  acc: Record<string, Example[]>,
  [key, value]: [string, unknown],
) {
  const segments = key.split('/');
  const folder = segments[segments.length - 2] ?? '';
  const file = (segments[segments.length - 1] ?? '').replace(/\.md$/, '.ts');

  (acc[folder] ||= []).push({ file, value: value as string });
  return acc;
}

const angular: Record<string, Example[]> = Object.entries(
  import.meta.glob('/src/content/getting-started/angular/**/*.md', {
    eager: true,
    query: 'raw',
    import: 'default',
  }),
).reduce(exampleReducer, {} as Record<string, Example[]>);

const react: Record<string, Example[]> = Object.entries(
  import.meta.glob('/src/content/getting-started/react/**/*.md', {
    eager: true,
    query: 'raw',
    import: 'default',
  }),
).reduce(exampleReducer, {} as Record<string, Example[]>);

const sdkExamplesSources: Record<string, Record<string, Example[]>> = {
  angular,
  react,
};

const openaiExamples: [string, string][] = Object.entries(
  import.meta.glob('/src/content/getting-started/openai/**/*.md', {
    eager: true,
    query: 'raw',
    import: 'default',
  }),
).map(([key, value]) => [
  key.split('/').pop()?.replace(/\.md$/, '.ts') ?? '',
  value as string,
]);

const googleExamples: [string, string][] = Object.entries(
  import.meta.glob('/src/content/getting-started/google/**/*.md', {
    eager: true,
    query: 'raw',
    import: 'default',
  }),
).map(([key, value]) => [
  key.split('/').pop()?.replace(/\.md$/, '.ts') ?? '',
  value as string,
]);

const writerExamples: [string, string][] = Object.entries(
  import.meta.glob('/src/content/getting-started/writer/**/*.md', {
    eager: true,
    query: 'raw',
    import: 'default',
  }),
).map(([key, value]) => [
  key.split('/').pop()?.replace(/\.md$/, '.ts') ?? '',
  value as string,
]);

const providerExamplesSources: Record<string, [string, string][]> = {
  openai: openaiExamples,
  google: googleExamples,
  writer: writerExamples,
};

interface Section {
  title: string;
  description: string;
  key: string;
  loomEmbedUrl: SafeResourceUrl;
}

@Component({
  selector: 'www-getting-started',
  imports: [
    Angular,
    BrandGoogle,
    BrandOpenAi,
    BrandWriter,
    ChevronDown,
    CodeExampleGroup,
    CodeExampleGroupItem,
    DropdownMenu,
    React,
    Squircle,
  ],
  template: `
    <div
      class="bleed"
      wwwSquircle="32"
      [wwwSquircleBorderWidth]="1"
      wwwSquircleBorderColor="rgba(173, 144, 124, 0.24)"
    >
      <h2>The Generative UI<br />Framework for Engineers</h2>
      <p>
        Hashbrown gives you a set of reactive primitives for streaming AI
        responses to the browser, generating component trees, and executing
        LLM-authored JavaScript, using your own components and AI provider.
      </p>
      <div class="sections">
        <nav
          wwwSquircle="16 0 16 0"
          [wwwSquircleBorderWidth]="1"
          wwwSquircleBorderColor="rgba(0, 0, 0, 0.12)"
        >
          @for (section of sections(); track section.title) {
            <button
              (click)="index.set($index)"
              [class.active]="index() === $index"
              wwwSquircle="16"
              [wwwSquircleBorderWidth]="1"
              wwwSquircleBorderColor="rgba(0, 0, 0, 0.12)"
            >
              <h3>{{ section.title }}</h3>
              <p>{{ section.description }}</p>
              <div class="indicator"></div>
            </button>
          }
        </nav>
      </div>
      <div
        class="player"
        wwwSquircle="0 16 16 16"
        [wwwSquircleBorderWidth]="1"
        wwwSquircleBorderColor="rgba(0, 0, 0, 0.12)"
      >
        <iframe
          [attr.src]="sections()[index()].loomEmbedUrl"
          frameborder="0"
          webkitallowfullscreen
          mozallowfullscreen
          allowfullscreen
          style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
        ></iframe>
      </div>
      <!--
      <div class="spacer"></div>
      <div class="examples">
        <div class="actions">
          <h3>{{ sections()[index()].title }}</h3>
          <div class="controls">
            <div class="sdk">
              <www-dropdown-menu
                [positions]="[
                  {
                    originX: 'end',
                    originY: 'bottom',
                    overlayX: 'end',
                    overlayY: 'top',
                    offsetY: 8,
                  },
                ]"
              >
                @switch (sdk()) {
                  @case ('angular') {
                    <label>
                      <span
                        ><www-angular
                          height="16px"
                          width="16px"
                          fill="#774625"
                        />Angular</span
                      >
                      <www-chevron-down height="16px" width="16px" />
                    </label>
                  }
                  @case ('react') {
                    <label>
                      <span
                        ><www-react
                          height="16px"
                          width="16px"
                          fill="#774625"
                        />React</span
                      >
                      <www-chevron-down height="16px" width="16px" />
                    </label>
                  }
                }
                <div content>
                  <button
                    (click)="onSdkChange('angular')"
                    class="menu-item sdk"
                  >
                    <www-angular height="16px" width="16px" fill="#774625" />
                    Angular
                  </button>
                  <button (click)="onSdkChange('react')" class="menu-item sdk">
                    <www-react height="16px" width="16px" fill="#774625" />
                    React
                  </button>
                </div>
              </www-dropdown-menu>
            </div>
            <div class="provider">
              <www-dropdown-menu
                [positions]="[
                  {
                    originX: 'end',
                    originY: 'bottom',
                    overlayX: 'end',
                    overlayY: 'top',
                    offsetY: 8,
                  },
                ]"
              >
                @switch (provider()) {
                  @case ('openai') {
                    <label>
                      <span
                        ><www-brand-openai
                          height="16px"
                          width="16px"
                          fill="#774625"
                        />OpenAI</span
                      >
                      <www-chevron-down height="16px" width="16px" />
                    </label>
                  }
                  @case ('google') {
                    <label>
                      <span
                        ><www-brand-google
                          height="16px"
                          width="16px"
                          fill="#774625"
                        />Google</span
                      >
                      <www-chevron-down height="16px" width="16px" />
                    </label>
                  }
                  @case ('writer') {
                    <label>
                      <span
                        ><www-brand-writer
                          height="16px"
                          width="16px"
                          fill="#774625"
                        />Writer</span
                      >
                      <www-chevron-down height="16px" width="16px" />
                    </label>
                  }
                }
              </www-dropdown-menu>
            </div>
          </div>
        </div>
        <www-code-example-group
          wwwSquircle="16"
          [wwwSquircleBorderWidth]="1"
          wwwSquircleBorderColor="rgba(0, 0, 0, 0.12)"
        >
          @for (example of computedExamples(); track example[0]) {
            <www-code-example-group-item
              [selfIndex]="$index"
              [header]="example[0]"
              [content]="example[1]"
            ></www-code-example-group-item>
          }
        </www-code-example-group>
      </div>
      -->
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      width: 100%;
      padding: 16px;
    }

    .bleed {
      display: grid;
      grid-template-columns: 1fr;
      row-gap: 24px;
      max-width: 1200px;
      width: 100%;

      > h2 {
        color: var(--gray-dark, #3d3c3a);
        font:
          750 20px/24px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 750;
      }

      > p {
        display: none;
        color: var(--gray, #5e5c5a);
        font:
          500 15px/18px 'Fredoka',
          sans-serif;
      }

      > .sections {
        display: flex;
        flex-direction: column;
        overflow-x: auto;
        margin-inline: -16px;
        padding: 16px;

        > nav {
          display: flex;
          min-width: 768px;
          gap: 16px;

          &::after {
            display: none;
          }

          > button {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 4px;
            text-align: left;
            padding: 16px;
            opacity: 0.64;
            background: #fff;
            transition: opacity 0.2s ease-in-out;

            &.active,
            &:hover {
              opacity: 1;
            }

            &.active > .indicator {
              opacity: 1;
            }

            &:last-child {
              border-bottom: none;
            }

            > h3 {
              color: var(--gray-dark, #3d3c3a);
              font:
                600 16px/24px 'Fredoka',
                sans-serif;
            }

            > p {
              color: var(--gray, #5e5c5a);
              font:
                350 13px/16px 'JetBrains Mono',
                sans-serif;
            }

            > .indicator {
              position: absolute;
              bottom: 0;
              left: 0;
              width: 100%;
              height: 8px;
              background: linear-gradient(
                to right,
                #fbbb52 0%,
                var(--sunset-orange) 25%,
                var(--indian-red-light) 50%,
                var(--sky-blue-dark) 75%,
                var(--olive-green-light) 100%
              );
              background-clip: border-box;
              opacity: 0;
              transition: opacity 0.2s ease-in-out;
            }
          }
        }
      }

      > .player {
        display: flex;
        width: 100%;
        aspect-ratio: 167/94;
        justify-content: flex-end;
        align-items: center;
        background: var(--sky-blue-light, #d8ecef);
      }

      > .spacer {
        display: none;
      }

      > .examples {
        display: flex;
        flex-direction: column;
        gap: 24px;
        overflow: hidden;

        > .actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 16px;

          > h3 {
            display: none;
            color: #000;
            font:
              600 15px/24px 'Fredoka',
              sans-serif;
          }

          > .controls {
            display: flex;
            align-items: center;
            gap: 8px;
          }
        }

        > www-code-example-group {
          flex: 1 auto;
          height: 100%;
          max-height: 640px;
        }
      }
    }

    .controls ::ng-deep button {
      display: flex;
      height: 40px;
      width: 100%;
      padding: 8px 12px;

      > label {
        display: flex;
        align-items: center;
        gap: 16px;
        width: 100%;
        color: var(--chocolate-brown, #774625);
        font:
          600 15px/19.5px Fredoka,
          sans-serif;

        > span {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }
    }

    .controls ::ng-deep .sdk button {
      background: var(--sunshine-yellow-light, #fde4ba);
    }

    .controls ::ng-deep .provider button {
      background: var(--sunset-orange-light, #f6d1b8);
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      width: 100%;
      border-radius: 8px;
      color: var(--chocolate-brown, #774625);
      font:
        400 13px/18px Fredoka,
        sans-serif;

      &.sdk {
        &:hover,
        &.active {
          background: var(--sunshine-yellow-light, #fde4ba);
        }
      }

      &.provider {
        &:hover,
        &.active {
          background: var(--sunset-orange-light, #f6d1b8);
        }
      }
    }

    @media screen and (max-width: 1023px) {
      .bleed {
        clip-path: none !important;

        &::after {
          display: none;
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        grid-template-columns: 320px auto;
        padding: 64px;
        background: #fff;

        &::after {
          display: block;
        }

        > p {
          display: block;
        }

        > .sections {
          overflow: inherit;
          margin-inline: 0;
          padding: 0;

          > nav {
            flex-direction: column;
            gap: 0;
            min-width: inherit;

            &::after {
              display: block;
            }

            > button {
              background: inherit;
              border-bottom: 1px solid rgba(0, 0, 0, 0.12);
              clip-path: none !important;

              &::after {
                display: none;
              }

              > .indicator {
                top: 0;
                right: 0;
                bottom: inherit;
                left: inherit;
                height: 100%;
                width: 8px;
                background: linear-gradient(
                  to bottom,
                  #fbbb52 0%,
                  var(--sunset-orange) 25%,
                  var(--indian-red-light) 50%,
                  var(--sky-blue-dark) 75%,
                  var(--olive-green-light) 100%
                );
              }
            }
          }
        }

        > .spacer {
          display: block;
        }

        > .examples {
          gap: 48px;

          > .actions {
            justify-content: space-between;

            > h3 {
              display: block;
            }
          }
        }
      }
    }
  `,
})
export class GettingStarted {
  configService = inject(ConfigService);
  sanitizer = inject(DomSanitizer);

  index = signal<number>(0);
  sections = signal<Section[]>([
    {
      title: 'Generative User Interfaces',
      description:
        'Expose your React or Angular components to an LLM, and let it generate a full UI.',
      key: 'generative-ui',
      loomEmbedUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.loom.com/embed/00f9bc82287b400f9ac37714262e4955?sid=78eb2d30-e541-412a-981a-428860ce4665',
      ),
    },
    {
      title: 'JavaScript Runtime',
      description:
        'Use LLMs to generate and run JavaScript for truly next-gen user interactions.',
      key: 'js-runtime',
      loomEmbedUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.loom.com/embed/e820ecdc43634f258dad37f7c8a46194?sid=d739a3d8-d1a2-450f-816b-f4f60bbce365',
      ),
    },
    {
      title: 'Streaming Responses',
      description:
        'Stream text, data, and UI from LLMs to your app, with full type safety along the way',
      key: 'streaming',
      loomEmbedUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.loom.com/embed/5c15403faa8246aa82ca9d17930336ed?sid=d6b31dcb-cb9a-4ded-832f-112912129973',
      ),
    },
  ]);
  section = computed(() => this.sections()[this.index()]);

  sdk = this.configService.sdk;
  sdks = signal<{ label: string; value: string; icon?: Type<unknown> }[]>([
    {
      label: 'Angular',
      value: 'angular',
      icon: Angular,
    },
    {
      label: 'React',
      value: 'react',
      icon: React,
    },
  ]);
  provider = this.configService.provider;
  providers = signal<{ label: string; value: string; icon?: Type<unknown> }[]>([
    {
      label: 'OpenAI',
      value: 'openai',
      icon: BrandOpenAi,
    },
    {
      label: 'Google',
      value: 'google',
      icon: BrandGoogle,
    },
    {
      label: 'Writer',
      value: 'writer',
      icon: BrandWriter,
    },
  ]);

  computedExamples = computed<[string, string][]>(() => {
    const sdkTuples: [string, string][] = (
      sdkExamplesSources[this.sdk()][this.section().key] ?? []
    ).map((e) => [e.file, e.value]);

    const providerTuples: [string, string][] =
      providerExamplesSources[this.provider()] ?? [];

    return [...sdkTuples, ...providerTuples];
  });

  onProviderChange(value: string): void {
    this.configService.set({ provider: value as AppConfig['provider'] });
  }

  onSdkChange(value: string): void {
    this.configService.set({ sdk: value as AppConfig['sdk'] });
  }
}
