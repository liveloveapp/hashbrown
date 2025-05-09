import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  Signal,
  inject,
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
        width: 100%;
        max-width: 767px;
        position: relative;
        padding: 32px;
        overflow: hidden;
      }

      menu {
        display: none;
        width: 186px;
        flex-direction: column;
        gap: 6px;
        position: fixed;
        top: 120px;
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
        gap: 32px;

        h1 {
          font:
            500 32px/40px Fredoka,
            sans-serif;
        }

        h2 {
          font:
            500 24px/32px Fredoka,
            sans-serif;
        }

        h3 {
          font:
            500 20px/28px Fredoka,
            sans-serif;
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

        code:not(pre code) {
          font-weight: 600;
        }
      }

      article ::ng-deep article ::ng-deep table {
        border-collapse: collapse;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        border-left: 1px solid rgba(255, 255, 255, 0.12);
        border-right: 1px solid rgba(255, 255, 255, 0.12);
        margin: 14px 0;
      }

      article ::ng-deep table thead {
        background-color: rgba(0, 0, 0, 0.36);
        font-family: 'Oxanium', sans-serif;
      }

      article ::ng-deep table tr {
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      }

      article ::ng-deep table th,
      article ::ng-deep table td {
        padding: 16px;
        text-align: left;
      }

      article ::ng-deep table td code {
        white-space: nowrap;
      }

      @media screen and (min-width: 1024px) {
        :host {
          max-width: 1024px;
        }

        article {
          padding-right: 218px;
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
