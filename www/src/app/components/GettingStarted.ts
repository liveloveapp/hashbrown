import {
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
  Type,
} from '@angular/core';
import { ButtonGroup } from './ButtonGroup';
import { Angular } from '../icons/Angular';
import { BrandGoogle } from '../icons/BrandGoogle';
import { BrandOpenAi } from '../icons/BrandOpenAi';
import { BrandWriter } from '../icons/BrandWriter';
import { Copy } from '../icons/Copy';
import { React } from '../icons/React';
import { CodeHighlight } from '../pipes/CodeHighlight';
import { AppConfig, ConfigService } from '../services/ConfigService';
import { CodeExampleGroup } from './CodeExampleGroup';
import { CodeExampleGroupItem } from './CodeExampleGroupItem';

const angularExamples: [string, string][] = Object.entries(
  import.meta.glob('/src/content/home/angular/**/*.md', {
    eager: true,
    query: 'raw',
    import: 'default',
  }),
).map(([key, value]) => [
  key.split('/').pop()?.replace(/\.md$/, '.ts') ?? '',
  value as string,
]);

const reactExamples: [string, string][] = Object.entries(
  import.meta.glob('/src/content/home/react/**/*.md', {
    eager: true,
    query: 'raw',
    import: 'default',
  }),
).map(([key, value]) => [
  key.split('/').pop()?.replace(/\.md$/, '.ts') ?? '',
  value as string,
]);

const sdkExamplesSources: Record<string, [string, string][]> = {
  angular: angularExamples,
  react: reactExamples,
};

const openaiExamples: [string, string][] = Object.entries(
  import.meta.glob('/src/content/home/openai/**/*.md', {
    eager: true,
    query: 'raw',
    import: 'default',
  }),
).map(([key, value]) => [
  key.split('/').pop()?.replace(/\.md$/, '.ts') ?? '',
  value as string,
]);

const googleExamples: [string, string][] = Object.entries(
  import.meta.glob('/src/content/home/google/**/*.md', {
    eager: true,
    query: 'raw',
    import: 'default',
  }),
).map(([key, value]) => [
  key.split('/').pop()?.replace(/\.md$/, '.ts') ?? '',
  value as string,
]);

const writerExamples: [string, string][] = Object.entries(
  import.meta.glob('/src/content/home/writer/**/*.md', {
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

@Component({
  selector: 'www-getting-started',
  imports: [
    ButtonGroup,
    CodeExampleGroup,
    CodeHighlight,
    Copy,
    CodeExampleGroupItem,
  ],
  template: `
    <div class="bleed">
      <div class="getting-started">
        <div class="steps">
          <h2>getting started</h2>
          <dl>
            <dt>
              <span>1</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="37"
                height="40"
                viewBox="0 0 37 40"
                fill="none"
              >
                <path
                  d="M20.0751 2.68072C35.0751 5.18072 40.0751 17.6807 32.5751 30.1807C30.0751 40.1807 17.5751 42.6807 7.57514 35.1807C-2.42486 25.1807 0.0751405 10.1807 7.57514 2.68072C12.5751 -2.31928 20.0751 2.68072 20.0751 2.68072Z"
                  fill="#F97583"
                />
              </svg>
            </dt>
            <dd>
              <h3>use AI directly in your app</h3>
              <p>
                Use an LLM to stream generated UI components, text completions,
                suggestions, and structured output directly into your web app.
              </p>
            </dd>
            <dt>
              <span>2</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="39"
                height="42"
                viewBox="0 0 39 42"
                fill="none"
              >
                <path
                  d="M19.6563 1.64701C34.6563 3.64701 40.6563 17.647 37.1563 30.147C33.6563 41.647 24.6563 43.647 14.6563 40.147C2.15635 36.647 -1.34365 20.147 2.15635 7.64701C5.65635 -1.35299 17.1563 -0.352985 19.6563 1.64701Z"
                  fill="#FBBB52"
                />
              </svg>
            </dt>
            <dd>
              <h3>configure hashbrown</h3>
              <p>
                Connect your app to your streaming API route, with a short
                circuit to disable hashbrown for users who have opted out of AI
              </p>
            </dd>
            <dt>
              <span>3</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="41"
                height="40"
                viewBox="0 0 41 40"
                fill="none"
              >
                <path
                  d="M20.5 0C33 0 40.5 7.5 40.5 20C40.5 32.5 30.5 40 20.5 40C10.5 40 0.5 32.5 0.5 20C0.5 7.5 8 0 20.5 0Z"
                  fill="#616F36"
                />
              </svg>
            </dt>
            <dd>
              <h3>expose chat api route</h3>
              <p>
                hashbrown ships with adapter packages for major LLM vendors that
                makes it easy to create streaming responses for your app to
                consume
              </p>
            </dd>
          </dl>
        </div>
        <div class="examples">
          <div class="controls">
            <www-button-group
              [options]="sdks()"
              [value]="sdk()"
              (valueChange)="onSdkChange($event)"
            />
            <www-button-group
              [options]="providers()"
              [value]="provider()"
              (valueChange)="onProviderChange($event)"
            />
          </div>
          <www-code-example-group>
            @for (example of computedExamples(); track example[0]) {
              <www-code-example-group-item
                [selfIndex]="$index"
                [header]="example[0]"
                [content]="example[1]"
              ></www-code-example-group-item>
            }
          </www-code-example-group>
          <div class="cta">
            <span [innerHTML]="cta() | codeHighlight: 'shell'"></span>
            <button
              (click)="onCopyInstall()"
              aria-label="Copy code to clipboard"
            >
              <www-copy height="16px" width="16px" />
            </button>
          </div>
        </div>
      </div>
      <a [href]="ctaHref()">read the full recipe</a>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      width: 100%;
      background: #3d3c3a;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      gap: 32px;
      padding: 64px 32px;
      max-width: 1460px;
      width: 100%;

      > .getting-started {
        display: grid;
        grid-template-columns: 1fr;
        flex-direction: column;
        gap: 32px;

        > .steps {
          display: flex;
          flex-direction: column;
          gap: 32px;

          > h2 {
            color: #fde4ba;
            font:
              700 normal 56px/64px Fredoka,
              sans-serif;
          }

          > dl {
            display: grid;
            grid-template-columns: 48px auto;
            row-gap: 24px;
            column-gap: 16px;

            > dt {
              position: relative;
              display: flex;
              justify-content: center;
              align-items: center;
              width: 40px;
              height: 40px;
              border-radius: 64px;

              > svg {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
              }

              > span {
                color: #fff;
                font:
                  700 normal 24px/32px Fredoka,
                  sans-serif;
                z-index: 1;
              }
            }

            > dd {
              display: flex;
              flex-direction: column;
              gap: 8px;

              > h3 {
                color: #fff;
                font:
                  700 normal 24px/32px Fredoka,
                  sans-serif;
              }

              > p {
                color: #faf9f0;
                font:
                  400 normal 16px/24px Poppins,
                  sans-serif;
              }
            }
          }
        }

        > .examples {
          display: flex;
          flex-direction: column;
          gap: 16px;

          > .controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
          }

          > www-code-example-group {
            flex: 1 auto;
            width: 100%;
            height: 100%;
            max-height: 640px;
            overflow: hidden;
          }

          > .cta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            border-radius: 8px;
            background: #2b2a29;
            overflow-x: scroll;
            > button {
              color: #fff;
              display: flex;
              align-items: center;
              opacity: 0.4;

              &:hover {
                opacity: 1;
              }
            }
          }
        }
      }

      > a {
        align-self: center;
        display: inline-flex;
        justify-content: center;
        align-items: center;
        border-radius: 32px;
        border: 6px solid #64afb5;
        background: #9ecfd7;
        color: #384849;
        font:
          500 18px/24px 'Fredoka',
          sans-serif;
        padding: 12px 24px;
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 128px 64px;
        gap: 64px;

        > .getting-started {
          gap: 96px;
          grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);

          > .steps {
            > dl {
              gap: 32px;
            }
          }
        }
      }
    }

    @media (width < 450px) {
      .bleed {
        > .getting-started {
          > .steps {
            > h2 {
              font:
                700 32px/48px Fredoka,
                sans-serif;
            }
          }
        }
      }
    }

    @media (width < 660px) {
      .bleed {
        > .getting-started {
          > .examples {
            > .controls {
              flex-direction: column;
            }
          }
        }
      }
    }

    @media (width < 768px) {
      .bleed {
        > .getting-started {
          > .examples {
            max-width: calc(100dvw - 64px);
          }
        }
      }
    }
  `,
})
export class GettingStarted {
  configService = inject(ConfigService);
  sdk = linkedSignal(() => this.configService.sdk());
  sdks = signal<{ label: string; value: string; icon?: Type<any> }[]>([
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
  provider = linkedSignal(() => this.configService.provider());
  providers = signal<{ label: string; value: string; icon?: Type<any> }[]>([
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

  private readonly sdkExamples = sdkExamplesSources;
  private readonly providerExamples = providerExamplesSources;

  cta = computed(() => {
    const sdk = this.configService.sdk();
    const provider = this.configService.provider();
    return `npm install @hashbrownai/{core,${provider},${sdk}} --save`;
  });

  ctaHref = computed(() => {
    return `/docs/${this.configService.sdk()}/start/quick`;
  });

  computedExamples = computed(() => {
    return [
      ...(this.sdkExamples[this.sdk()] ?? []),
      ...(this.providerExamples[this.provider()] ?? []),
    ];
  });

  async onCopyInstall(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.cta());
    } catch (err) {
      console.error('Copy failed', err);
    }
  }

  onProviderChange(value: string): void {
    this.configService.set({ provider: value as AppConfig['provider'] });
  }

  onSdkChange(value: string): void {
    this.configService.set({ sdk: value as AppConfig['sdk'] });
  }
}
