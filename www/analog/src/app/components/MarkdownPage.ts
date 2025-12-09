import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  PLATFORM_ID,
  Signal,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

type Heading = { level: number; text: string; id: string; url: string };

@Component({
  selector: 'www-markdown-page',
  template: `
    <article #article>
      <ng-content></ng-content>
    </article>
    <menu #menu>
      @for (heading of headings(); track $index) {
        <a
          [href]="heading.url"
          [style]="{ paddingLeft: 24 + (heading.level - 2) * 8 + 'px' }"
          [class.active]="activeHeadingId() === heading.id"
          (click)="navigateToHeading($event, heading)"
        >
          {{ heading.text }}
        </a>
      }
    </menu>
    <div
      #bottomSentinel
      style="position:absolute;bottom:0;width:1px;height:1px;"
    ></div>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        padding: 16px;
        overflow: hidden;
      }

      menu {
        display: none;
        width: 186px;
        flex-direction: column;
        position: fixed;
        top: 128px;
        right: 32px;
        margin: 0;
        padding: 0;
        opacity: 1;
        transition: opacity 0.3s ease-in-out;
      }

      menu.fade-out {
        opacity: 0;
      }

      menu a {
        padding: 4px 0;
        color: var(--gray, #5e5c5a);
        font:
          400 13px/18px Fredoka,
          sans-serif;
        border-left: 1px solid #dcdad5;
      }

      menu a:hover {
        color: rgb(47, 47, 43);
      }

      menu a.active {
        color: rgb(47, 47, 43);
        border-left: 1px solid var(--gray-dark, #3d3c3a);
      }

      article ::ng-deep analog-markdown-route > div {
        display: flex;
        flex-direction: column;
        color: var(--gray-dark, #3d3c3a);
        font:
          400 15px/21px Fredoka,
          sans-serif;

        h1 {
          color: var(--gray, #5e5c5a);
          font:
            750 22px/32px KefirVariable,
            sans-serif;
          font-variation-settings: 'wght' 750;
          margin: 0 0 8px 0;
        }

        h2,
        h3,
        h4 {
          color: var(--gray, #5e5c5a);
          margin-bottom: 8px;
          font:
            500 18px/24px Fredoka,
            sans-serif;

          > code:not(pre code) {
            font-size: 17px;
            line-height: 24px;
          }
        }

        h3,
        h4 {
          font-size: 16px;
          line-height: 22px;
        }

        p {
          margin: 0 0 8px 0;
          padding: 0;
          line-height: 1.6;

          &.subtitle {
            color: var(--chocolate-brown-light);
            margin: -8px 0 16px 0;
            font:
              300 18px/24px Fredoka,
              sans-serif;
          }
        }

        ul,
        ol {
          margin: 0 0 8px 0;
        }

        hr {
          border: 0;
          border-top: 1px solid #dcdad5;
          margin: 32px 0;
        }

        strong {
          font-weight: 600;
        }

        ul,
        ol {
          display: flex;
          flex-direction: column;
          list-style: none;
          margin-left: 8px;
          margin-bottom: 8px;

          > li {
            position: relative;
            padding-left: 40px;
            font:
              400 15px/24px Fredoka,
              sans-serif;
          }
        }

        ul {
          gap: 8px;

          > li {
            padding-left: 32px;

            &::before {
              position: absolute;
              top: 9px;
              left: 8px;
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: var(--chocolate-brown);
              content: '';
            }
          }
        }

        ol {
          gap: 16px;
          counter-reset: ordered-listitem;
          margin-top: 8px;

          > li {
            &::after {
              position: absolute;
              top: -1px;
              left: 0;
              background: var(--sunshine-yellow-light, #fbe7b6);
              border: 1px solid var(--sunshine-yellow-dark, #e8a23d);
              border-radius: 8px;
              width: 24px;
              height: 24px;
              display: inline-block;
              text-align: center;
              content: counter(ordered-listitem);
              counter-increment: ordered-listitem;
            }
          }
        }

        hb-code-example {
          margin-bottom: 16px;
        }

        :not(hb-symbol-link) > a {
          text-decoration: underline;
          text-decoration-color: #774625;
          color: #774625;
          font-weight: 600;

          &:hover {
            text-decoration-color: #fbbb52;
          }

          &.cta {
            align-self: flex-end;
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
            text-decoration: none;
            padding: 12px 24px;
          }
        }

        hb-next-step a {
          text-decoration: none;
        }

        > pre.shiki.hashbrown {
          padding: 24px;
          border-radius: 16px;
          border: 4px solid var(--gray-light, #a4a3a1);
          background: var(--gray-dark, #3d3c3a) !important;
          overflow-x: auto;
          margin-bottom: 16px;
        }

        code:not(pre code) {
          font:
            700 14px/21px 'JetBrains Mono',
            monospace;
        }

        table {
          display: block;
          overflow-x: auto;
          border-collapse: collapse;
          border-radius: 12px;
          margin: 0 0 24px;
          box-shadow: inset 0 0 0 1px #000;

          > thead {
            padding: 8px 16px;
            color: rgba(250, 249, 240, 0.8);
            background: #3d3c3a;
            border-bottom: 1px solid #000;
            font-size: 12px;
            font-weight: 500;
          }

          tr {
            border-bottom: 1px solid #000;
          }

          th,
          td {
            padding: 16px;
            text-align: left;
          }

          th {
            font:
              400 16px/24px Fredoka,
              sans-serif;
          }

          code {
            white-space: nowrap;
          }
        }
      }

      @media screen and (min-width: 1024px) {
        :host {
          max-width: 800px;
          padding: 24px;
        }
      }

      @media screen and (min-width: 1281px) {
        :host {
          padding-right: 250px;
          max-width: 1024px;
        }

        menu {
          display: flex;
        }
      }
    `,
  ],
})
export class MarkdownPage implements AfterViewInit, OnDestroy {
  router = inject(Router);
  platformId = inject(PLATFORM_ID);
  articleRef: Signal<ElementRef<HTMLElement>> = viewChild.required('article');
  private menuRef: Signal<ElementRef<HTMLElement>> = viewChild.required('menu');
  private bottomSentinelRef: Signal<ElementRef<HTMLElement>> =
    viewChild.required('bottomSentinel');
  headings = signal<Heading[]>([]);
  activeHeadingId = signal<string | null>(null);
  mutationObserver?: MutationObserver;
  intersectionObserver?: IntersectionObserver;
  private fadeObserver?: IntersectionObserver;

  ngAfterViewInit(): void {
    this.collectHeadings();
    if (isPlatformBrowser(this.platformId)) {
      this.mutationObserver = new MutationObserver(() => {
        this.collectHeadings();
        this.watchHeadings();
      });
      this.mutationObserver.observe(this.articleRef().nativeElement, {
        childList: true,
        subtree: true,
      });
      this.watchHeadings();
      this.fadeObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          const menuEl = this.menuRef().nativeElement;
          if (entry.isIntersecting) {
            menuEl.classList.add('fade-out');
          } else {
            const bounding = entry.boundingClientRect;
            const rootBounds = entry.rootBounds!;
            // If sentinel exited viewport at bottom, show menu; if exited at top, keep hidden
            if (bounding.top > rootBounds.bottom) {
              menuEl.classList.remove('fade-out');
            }
          }
        },
        { root: null, threshold: 0 },
      );
      this.fadeObserver.observe(this.bottomSentinelRef().nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.mutationObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.fadeObserver?.disconnect();
  }

  navigateToHeading($event: MouseEvent, heading: Heading) {
    $event.preventDefault();

    this.router.navigate([], { fragment: heading.id }).then(() => {
      const element = document.getElementById(heading.id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  private collectHeadings() {
    const headingElements =
      this.articleRef().nativeElement.querySelectorAll('h1, h2, h3');
    const headings: Heading[] = [];

    for (const heading of Array.from(headingElements)) {
      const textContent = heading.textContent ?? '';
      const id = textContent
        .toLowerCase()
        .replace(/ /g, '-')
        .replace(/:/g, '')
        .replace(/@/g, '')
        .replace(/\//g, '-');
      heading.id = id;

      const currentUrl = this.router.url;
      const currentUrlWithoutHash = currentUrl.split('#')[0];
      const url = `${currentUrlWithoutHash}#${id}`;

      headings.push({
        level: parseInt(heading.tagName[1]),
        text: textContent,
        id,
        url,
      });
    }

    this.headings.set(headings);
  }

  private watchHeadings() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = undefined;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        const intersectingEntries = entries.filter(
          (entry) => entry.isIntersecting,
        );
        const firstHeadingIntersecting = this.headings().find((heading) =>
          intersectingEntries.some((e) => e.target.id === heading.id),
        );

        if (firstHeadingIntersecting) {
          this.activeHeadingId.set(firstHeadingIntersecting.id);
        }
      },
      { threshold: 1 },
    );

    const headingElements =
      this.articleRef().nativeElement.querySelectorAll('h1, h2, h3');

    for (const heading of Array.from(headingElements)) {
      this.intersectionObserver.observe(heading);
    }
  }
}
