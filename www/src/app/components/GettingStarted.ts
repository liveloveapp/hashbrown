import { Component, computed, signal, Type } from '@angular/core';
import { ButtonGroup } from '../ButtonGroup';
import { Angular } from '../icons/Angular';
import { BrandGoogle } from '../icons/BrandGoogle';
import { BrandOpenAi } from '../icons/BrandOpenAi';
import { BrandWriter } from '../icons/BrandWriter';
import { Copy } from '../icons/Copy';
import { React } from '../icons/React';
import { CodeHighlight } from '../pipes/CodeHighlight';
import { CodeExampleGroup } from './CodeExampleGroup';
import { CodeExampleGroupItem } from './CodeExampleGroupItem';

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
              Connect your app to your streaming API route, with a short circuit
              to disable hashbrown for users who have opted out of AI
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
            (valueChange)="sdk.set($event)"
          />
          <www-button-group
            [options]="providers()"
            [value]="provider()"
            (valueChange)="provider.set($event)"
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
          <span
            [innerHTML]="
              'npm install @hashbrownai/{core,openai,angular} --save'
                | codeHighlight: 'shell'
            "
          ></span>
          <button (click)="onCopyInstall()" aria-label="Copy code to clipboard">
            <www-copy height="16px" width="16px" />
          </button>
        </div>
      </div>
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
      display: grid;
      grid-template-columns: 1fr;
      flex-direction: column;
      gap: 32px;
      padding: 64px 32px;
      width: 100%;

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

    @media screen and (min-width: 1024px) {
      .bleed {
        gap: 96px;
        padding: 128px 64px;
        grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);

        > .steps {
          > dl {
            gap: 32px;
          }
        }
      }
    }
  `,
})
export class GettingStarted {
  sdk = signal<string>('angular');
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
  sdkExamples = signal<Record<string, [string, string][]>>({
    angular: Object.entries(
      import.meta.glob('/src/app/content/home/angular/**/*.md', {
        as: 'raw',
        eager: true,
      }),
    ).map(([key, value]) => [
      key.split('/').pop()?.replace(/.md$/, '.ts') ?? '',
      value,
    ]),
    react: Object.entries(
      import.meta.glob('/src/app/content/home/react/**/*.md', {
        as: 'raw',
        eager: true,
      }),
    ).map(([key, value]) => [
      key.split('/').pop()?.replace(/.md$/, '.ts') ?? '',
      value,
    ]),
  });

  provider = signal<string>('openai');
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
  providerExamples = signal<Record<string, [string, string][]>>({
    azure: Object.entries(
      import.meta.glob('/src/app/content/home/azure/**/*.md', {
        as: 'raw',
        eager: true,
      }),
    ).map(([key, value]) => [
      key.split('/').pop()?.replace(/.md$/, '.ts') ?? '',
      value,
    ]),
    google: Object.entries(
      import.meta.glob('/src/app/content/home/google/**/*.md', {
        as: 'raw',
        eager: true,
      }),
    ).map(([key, value]) => [
      key.split('/').pop()?.replace(/.md$/, '.ts') ?? '',
      value,
    ]),
    openai: Object.entries(
      import.meta.glob('/src/app/content/home/openai/**/*.md', {
        as: 'raw',
        eager: true,
      }),
    ).map(([key, value]) => [
      key.split('/').pop()?.replace(/.md$/, '.ts') ?? '',
      value,
    ]),
    writer: Object.entries(
      import.meta.glob('/src/app/content/home/writer/**/*.md', {
        as: 'raw',
        eager: true,
      }),
    ).map(([key, value]) => [
      key.split('/').pop()?.replace(/.md$/, '.ts') ?? '',
      value,
    ]),
  });

  computedExamples = computed(() => {
    return [
      ...this.sdkExamples()[this.sdk()],
      ...this.providerExamples()[this.provider()],
    ];
  });

  async onCopyInstall(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        'npm install @hashbrownai/{core,openai,angular} --save',
      );
    } catch (err) {
      console.error('Copy failed', err);
    }
  }
}
