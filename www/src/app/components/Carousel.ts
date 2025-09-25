import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ChevronLeft } from '../icons/ChevronLeft';
import { ChevronRight } from '../icons/ChevronRight';

@Component({
  selector: 'www-carousel',
  imports: [ChevronLeft, ChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--columns]': 'columnsStyle()',
  },
  template: `
    <div class="carousel">
      <div class="scroller" #scroller>
        <ng-content></ng-content>
      </div>
    </div>
    <div class="actions">
      <button
        type="button"
        aria-label="Scroll left"
        (click)="page(-1)"
        [class.active]="canScrollLeft()"
        [disabled]="!canScrollLeft()"
      >
        <www-chevron-left height="16px" width="16px" />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        (click)="page(1)"
        [class.active]="canScrollRight()"
        [disabled]="!canScrollRight()"
      >
        <www-chevron-right height="16px" width="16px" />
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      justify-content: stretch;
      align-items: stretch;
      --gap: 16px;
      --peek: 48px;
      --columns: 1;
    }

    .carousel {
      position: relative;

      > .scroller {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: calc(
          (100% - var(--peek) - (var(--columns) * var(--gap))) / var(--columns)
        );
        column-gap: var(--gap);
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scroll-snap-type: x proximity;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 8px;

        > * {
          scroll-snap-align: start;
        }
      }
    }

    .scroller ::ng-deep > * {
      max-width: calc(100% + var(--peek));
      padding: 16px;
      margin: 0;
    }

    .actions {
      align-self: center;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;

      > button {
        background: var(--sky-blue, #64afb5);
        color: var(--gray-dark, #3d3c3a);
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        opacity: 0.4;

        &.active {
          opacity: 1;
        }
      }
    }

    @media screen and (min-width: 768px) {
      :host {
        --columns: 2;
      }

      .scroller {
        grid-auto-rows: 1fr;
        align-items: stretch;
        /* Let items size by their intrinsic widths at the set height */
        grid-auto-columns: max-content;
        padding-right: var(--peek);
      }

      .scroller > * {
        width: auto;
        height: 100%;
      }

      .scroller img,
      .scroller video {
        width: auto;
        height: 100%;
        object-fit: contain;
      }
    }

    @media screen and (min-width: 1024px) {
      :host {
        --columns: 3;
      }

      .scroller {
        grid-auto-rows: 1fr;
        align-items: stretch;
        /* Let items size by their intrinsic widths at the set height */
        grid-auto-columns: max-content;
        padding-right: var(--peek);
      }

      .scroller > * {
        width: auto;
        height: 100%;
      }

      .scroller img,
      .scroller video {
        width: auto;
        height: 100%;
        object-fit: contain;
      }
    }
  `,
})
export class Carousel {
  // Optional override for the number of columns.
  // When provided (via <hb-carousel columns="...">), it sets the --columns CSS var
  // which controls layout on small screens and paging behavior.
  readonly columns = input<number | string | null>(null);

  readonly columnsStyle = computed(() => {
    const value = this.columns();
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isFinite(n) || n <= 0) return null;
    return String(n);
  });

  scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
  private scrollLeftSig = signal(0);
  private scrollWidthSig = signal(0);
  private clientWidthSig = signal(0);

  canScrollLeft = computed(() => this.scrollLeftSig() > 0);
  canScrollRight = computed(() => {
    const max = Math.max(0, this.scrollWidthSig() - this.clientWidthSig());
    return this.scrollLeftSig() < max - 1; // allow for sub-pixel rounding
  });

  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private onScroll = () => this.updateMetrics();

  page(direction: 1 | -1) {
    const el = this.scroller()?.nativeElement;
    if (!el) return;

    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return;

    const rect = first.getBoundingClientRect();
    const itemWidth = rect.width;
    const styles = getComputedStyle(el);
    const gap = parseFloat(styles.columnGap || '0') || 0;
    const columnsRaw = styles.getPropertyValue('--columns').trim();
    const columns = Number.parseFloat(columnsRaw || '1') || 1;

    const step = itemWidth * columns + gap * columns;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  ngAfterViewInit() {
    const el = this.scroller()?.nativeElement;
    if (!el) return;

    // Observe size changes
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.updateMetrics());
      this.resizeObserver.observe(el);
    }

    // Observe content changes (children added/removed)
    this.mutationObserver = new MutationObserver(() => this.updateMetrics());
    this.mutationObserver.observe(el, { childList: true, subtree: true });

    // Scroll updates
    el.addEventListener('scroll', this.onScroll, { passive: true });

    // Initial metrics
    // Use rAF to allow layout to settle after content projection
    requestAnimationFrame(() => this.updateMetrics());
  }

  ngOnDestroy() {
    const el = this.scroller()?.nativeElement;
    el?.removeEventListener('scroll', this.onScroll);
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
  }

  private updateMetrics() {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    this.scrollLeftSig.set(el.scrollLeft);
    this.scrollWidthSig.set(el.scrollWidth);
    this.clientWidthSig.set(el.clientWidth);
  }
}
