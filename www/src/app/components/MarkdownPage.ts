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
    <div
      #bottomSentinel
      style="position:absolute;bottom:0;width:1px;height:1px;"
    ></div>
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
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        padding: 0 32px 32px;
        overflow: hidden;
      }

      menu {
        display: none;
        width: 186px;
        flex-direction: column;
        gap: 6px;
        position: fixed;
        top: 160px;
        right: 32px;
        margin: 0;
        padding: 0;
        border-left: 1px solid #fbbb52;
        opacity: 1;
        transition: opacity 0.3s ease-in-out;
      }

      menu.fade-out {
        opacity: 0;
      }

      menu a {
        color: rgba(47, 47, 43, 0.88);
        font-size: 13px;
        border-left: 2px solid transparent;
      }

      menu a:hover {
        color: rgb(47, 47, 43);
      }

      menu a.active {
        color: rgb(47, 47, 43);
        border-left: 6px solid #fbbb52;
      }

      article ::ng-deep analog-markdown-route > div {
        display: flex;
        flex-direction: column;

        h1 {
          font:
            500 32px/40px Fredoka,
            sans-serif;
          margin-top: 8px;
          margin-bottom: 16px;
        }

        h2 {
          font:
            500 24px/32px Fredoka,
            sans-serif;
          margin-top: 8px;
          margin-bottom: 12px;
        }

        h3 {
          font:
            500 20px/28px Fredoka,
            sans-serif;
          margin-top: 8px;
          margin-bottom: 12px;
        }

        h4 {
          margin-top: 8px;
          margin-bottom: 12px;
        }

        p {
          margin: 0 0 12px;
          line-height: 1.8;
        }

        ul,
        ol {
          margin-bottom: 16px;
        }

        hr {
          border: 0;
          border-top: 1px solid rgba(47, 47, 43, 0.24);
          margin: 32px 0;
        }

        strong {
          font-weight: 600;
        }

        ul {
          list-style: disc;
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-left: 24px;
        }

        ol {
          list-style: decimal;
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-left: 24px;
        }

        :not(www-symbol-link) > a {
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

        > pre.shiki.hashbrown {
          padding: 16px;
          border-radius: 8px;
          background: #2b2a29 !important;
          overflow-x: auto;
          margin-bottom: 16px;
        }

        code:not(pre code) {
          font:
            600 16px/24px 'Operator mono',
            monospace;
        }

        table {
          border-collapse: collapse;
          border-radius: 12px;
          margin: 0 0 24px;
          overflow: hidden;
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
