import {
  Component,
  contentChildren,
  effect,
  ElementRef,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Copy } from '../icons/Copy';
import { CodeExampleGroupItem } from './CodeExampleGroupItem';

@Component({
  selector: 'www-code-example-group',
  standalone: true,
  imports: [Copy],
  template: `
    <div class="header">
      <div class="menu">
        <div class="generic">
          <div class="span"></div>
          <div class="span"></div>
          <div class="span"></div>
        </div>
        <div class="tabs">
          @for (item of items(); track $index; let i = $index) {
            <button [class.active]="i === index()" (click)="index.set(i)">
              {{ item.header() }}
            </button>
          }
        </div>
      </div>
      <button (click)="onCopy()" aria-label="Copy code to clipboard">
        <www-copy height="16px" width="16px" />
        copy
      </button>
    </div>
    <div class="content" #content>
      <ng-content />
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        border: 1px solid #3d3c3a;
        border-radius: 12px;
        overflow: hidden;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #faf9f0;
        color: #3d3c3a;
        font:
          400 normal 12px/16px Poppins,
          sans-serif;

        > .menu {
          display: flex;

          > .generic {
            align-self: center;
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 0 16px;
            border-radius: 8px;

            > .span {
              width: 8px;
              height: 8px;
              border-radius: 4px;
              border: 1px solid #3d3c3a;
            }
          }

          > .tabs {
            display: flex;
            height: 100%;

            > button {
              cursor: pointer;
              padding: 12px 16px;
              border-right: 1px solid #3d3c3a;

              &.active {
                font-weight: 600;
                text-decoration: underline;
              }
            }
          }
        }

        > button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
        }
      }

      .content {
        background: #2b2a29;
        padding: 16px;
        flex-grow: 0;
        overflow: auto;
      }
    `,
  ],
})
export class CodeExampleGroup {
  index = signal<number>(0);
  items = contentChildren<CodeExampleGroupItem>(CodeExampleGroupItem);
  contentRef = viewChild<ElementRef<HTMLDivElement>>('content');

  private syncIndex = effect(() => {
    const index = this.index();
    untracked(() => {
      this.items().forEach((item, i) => {
        item.index.set(index);
      });
    });
  });

  private resetIndex = effect(() => {
    this.items();
    this.index.set(0);
  });

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
