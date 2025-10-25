import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  Component,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { Copy } from '../icons/Copy';
import { PlayerPlay } from '../icons/PlayerPlay';
import { type Backend, ConfigService } from '../services/ConfigService';
import { Squircle } from './Squircle';

export type { Backend };

@Component({
  selector: 'www-backend-code-example',
  imports: [Copy, PlayerPlay, Squircle, CommonModule],
  template: `
    <div
      class="backend-code-example"
      wwwSquircle="16"
      [wwwSquircleBorderWidth]="8"
      wwwSquircleBorderColor="var(--gray-light, #a4a3a1)"
    >
      <div class="header">
        <div class="tabs">
          @for (backend of backends(); track backend) {
            <button
              class="tab"
              [class.active]="config.backend() === backend"
              (click)="selectBackend(backend)"
              [attr.aria-label]="'Switch to ' + backend | titlecase"
            >
              {{ backend | titlecase }}
            </button>
          }
        </div>
        <div class="actions">
          @if (run()) {
            <a [href]="run()">
              <www-player-play height="16px" width="16px" />
              run
            </a>
          }
          @if (copyable()) {
            <button (click)="onCopy()" aria-label="Copy code to clipboard">
              <www-copy height="18px" width="18px" />
            </button>
          }
          <ng-content select="[actions]" />
        </div>
      </div>
      <div class="content" #content wwwSquircle="16">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .backend-code-example {
      display: flex;
      flex-direction: column;
      background: var(--gray, #5e5c5a);
      overflow: hidden;

      > .header {
        display: flex;
        justify-content: space-between;
        padding: 14px 24px 12px 24px;
        color: var(--vanilla-ivory, #faf9f0);
        font:
          400 13px/18px 'JetBrains Mono',
          sans-serif;

        > .tabs {
          display: flex;
          gap: 24px;

          > .tab {
            display: inline-flex;
            align-items: center;
            position: relative;
            padding: 0;
            background: none;
            border: none;
            color: #a4a3a1;
            font:
              400 13px/18px 'JetBrains Mono',
              sans-serif;
            cursor: pointer;
            transition: color 0.2s ease;

            &:hover {
              color: #e3e3e3;
            }

            &.active {
              color: var(--vanilla-ivory, #faf9f0);

              &::before {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                height: 3px;
                margin-bottom: -12px;
                border-radius: 1px;
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
            }
          }
        }

        > .actions {
          display: flex;
          align-items: center;
          gap: 16px;

          > a,
          > button {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #e3e3e3;
            font:
              500 12px/14px 'Fredoka',
              sans-serif;
          }

          > a {
            text-decoration: none;
            color: inherit;
          }
        }
      }

      > .content {
        background: var(--gray-dark, #3d3c3a);
        padding: 16px;
        overflow-x: scroll;
        margin: 0 4px 4px 4px;
      }
    }
  `,
})
export class BackendCodeExample {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  config = inject(ConfigService);

  copyable = input<boolean>(true);
  run = input<string | undefined>(undefined);
  backends = input<Backend[]>(['express', 'fastify', 'nestjs', 'hono']);
  defaultBackend = input<Backend>('express');

  contentRef = viewChild<ElementRef<HTMLDivElement>>('content');

  constructor() {
    // Show/hide backend elements based on selection
    effect(() => {
      const selected = this.config.backend();
      const defaultValue = this.defaultBackend();
      const content = this.contentRef()?.nativeElement;

      if (!content) {
        return;
      }

      const children = Array.from(content.children) as HTMLElement[];

      // If no config in localStorage and we have a different default, use it
      const effectiveBackend =
        (!this.isBrowser || !localStorage.getItem('config')) &&
        defaultValue !== 'express'
          ? defaultValue
          : selected;

      children.forEach((el) => {
        const backendAttr = el.getAttribute('backend');
        if (backendAttr === effectiveBackend) {
          el.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
      });
    });
  }

  selectBackend(backend: Backend) {
    this.config.set({ backend });
  }

  async onCopy() {
    const el = this.contentRef()?.nativeElement;
    if (!el) {
      return;
    }

    const text = el.innerText || el.textContent || '';
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Copy failed', err);
    }
  }
}
