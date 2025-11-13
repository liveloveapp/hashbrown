import { CommonModule } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { prepareMagicText, type MagicTextFragment } from '@hashbrownai/core';
import { LinkClickHandler } from '../link-click-handler';

@Component({
  selector: 'app-paragraph',
  imports: [CommonModule],
  preserveWhitespaces: false,
  template: `
    <p class="paragraph" (click)="preventLinkNavigation($event)">
      @for (
        fragment of visibleFragments();
        track fragment.key;
        let index = $index
      ) {
        @if (fragment.kind === 'text') {
          <span
            class="fragment"
            [class.fragment--provisional]="fragment.state === 'provisional'"
            [class.fragment--static]="isStaticFragment(fragment)"
            [style.--fragment-delay.ms]="0"
            [style.--fragment-duration.ms]="
              isStaticFragment(fragment) ? 0 : fragmentDuration
            "
          >
            @if (fragment.marks.link) {
              <a
                [href]="fragment.marks.link.href"
                [attr.title]="fragment.marks.link.title"
                [attr.aria-label]="fragment.marks.link.ariaLabel"
                [attr.rel]="fragment.marks.link.rel ?? defaultLinkRel"
                [attr.target]="fragment.marks.link.target ?? defaultLinkTarget"
                (click)="handleAnchorClick($event, fragment.marks.link.href)"
              >
                <ng-container
                  [ngTemplateOutlet]="richStrong"
                  [ngTemplateOutletContext]="{ $implicit: fragment }"
                ></ng-container>
              </a>
            } @else {
              <ng-container
                [ngTemplateOutlet]="richStrong"
                [ngTemplateOutletContext]="{ $implicit: fragment }"
              ></ng-container>
            }
          </span>
        } @else {
          <sup
            class="fragment citation"
            role="doc-noteref"
            [style.--fragment-delay.ms]="0"
            [style.--fragment-duration.ms]="fragmentDuration"
          >
            @if (fragment.citation.href) {
              <a
                [href]="fragment.citation.href"
                rel="noopener noreferrer"
                target="_blank"
                (click)="handleAnchorClick($event, fragment.citation.href)"
              >
                {{ fragment.text }}
              </a>
            } @else {
              {{ fragment.text }}
            }
          </sup>
        }
      }
    </p>

    <ng-template #richStrong let-fragment>
      @if (fragment.marks.strong) {
        <strong>
          <ng-container
            [ngTemplateOutlet]="richEm"
            [ngTemplateOutletContext]="{ $implicit: fragment }"
          ></ng-container>
        </strong>
      } @else {
        <ng-container
          [ngTemplateOutlet]="richEm"
          [ngTemplateOutletContext]="{ $implicit: fragment }"
        ></ng-container>
      }
    </ng-template>

    <ng-template #richEm let-fragment>
      @if (fragment.marks.em) {
        <em>
          <ng-container
            [ngTemplateOutlet]="richCode"
            [ngTemplateOutletContext]="{ $implicit: fragment }"
          ></ng-container>
        </em>
      } @else {
        <ng-container
          [ngTemplateOutlet]="richCode"
          [ngTemplateOutletContext]="{ $implicit: fragment }"
        ></ng-container>
      }
    </ng-template>

    <ng-template #richCode let-fragment>
      @if (fragment.marks.code) {
        <code
          class="fragment-text fragment-text--code"
          [textContent]="fragment.text"
        ></code>
      } @else {
        <span class="fragment-text" [textContent]="fragment.text"></span>
      }
    </ng-template>
  `,
  host: {
    '[attr.raw-text]': 'text()',
  },
  styles: [
    `
      :host {
        display: block;
        width: var(--article-width);
        margin-bottom: 12px;
      }

      .paragraph {
        line-height: 1.3;
      }

      .fragment {
        display: inline;
        opacity: 0;
        animation-name: fragment-reveal, fragment-flash;
        animation-duration: var(--fragment-duration, 500ms);
        animation-delay: var(--fragment-delay, 0ms);
        animation-fill-mode: forwards;
        animation-timing-function: ease;
      }

      .fragment--provisional {
        opacity: 0.65;
      }

      .fragment--static {
        opacity: 1;
        animation: none;
      }

      .citation {
        font-size: 0.85em;
        margin-left: 2px;
      }

      .fragment-text {
        white-space: pre-wrap;
      }

      .fragment-text--code {
        font-family: var(--code-font, 'SFMono-Regular', 'Consolas', monospace);
        background: var(--fragment-code-bg, rgba(0, 0, 0, 0.08));
        padding: 0 3px;
        border-radius: 4px;
      }

      @keyframes fragment-reveal {
        0% {
          opacity: 0;
          transform: translateY(0.35em);
        }

        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes fragment-flash {
        0% {
          background: var(--fragment-highlight, rgba(0, 0, 0, 0.06));
        }

        100% {
          background: transparent;
        }
      }
    `,
  ],
})
export class Paragraph {
  readonly linkClickHandler = inject(LinkClickHandler);
  readonly text = input.required<string>();
  protected readonly prepared = computed(() =>
    prepareMagicText(this.text(), { unit: 'run' }),
  );
  protected readonly visibleFragments = computed(
    () => this.prepared().fragments,
  );
  protected readonly defaultLinkTarget = '_blank';
  protected readonly defaultLinkRel = 'noopener noreferrer';
  protected readonly fragmentDuration = 220;
  protected readonly isStaticFragment = (
    fragment: MagicTextFragment,
  ): boolean =>
    fragment.state === 'provisional' ||
    (fragment.kind === 'text' && fragment.text.trim().length === 0);

  handleAnchorClick(event: MouseEvent, href?: string) {
    event.preventDefault();
    if (href) {
      this.linkClickHandler.onClickLink(href);
    }
  }

  preventLinkNavigation(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const anchor = target.closest('a');
    if (!anchor) {
      return;
    }
    event.preventDefault();
  }
}
