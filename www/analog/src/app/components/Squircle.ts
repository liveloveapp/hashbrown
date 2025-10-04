import {
  afterRenderEffect,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getSvgPath } from 'figma-squircle';

declare const Buffer: {
  from(input: string): { toString(encoding: 'base64'): string };
};

@Directive({
  selector: '[wwwSquircle]',
  host: {
    '[style.clip-path]': 'clipPathPropertyValue()',
    '[style.--www-squircle-border-image-url]': 'borderImageUrl()',
    '[style.--www-squircle-border-color]': 'wwwSquircleBorderColor()',
    '[style.--www-squircle-border-width]': 'wwwSquircleBorderWidth() + "px"',
    '[style.--www-squircle-width]': 'wwwSquircleWidth()',
    '[style.--www-squircle-height]': 'wwwSquircleHeight()',
  },
})
export class Squircle implements OnDestroy {
  readonly host = inject(ElementRef);
  readonly platformId = inject(PLATFORM_ID);
  readonly isBrowser = isPlatformBrowser(this.platformId);
  readonly wwwSquircle = input.required<string>();
  readonly wwwSquircleSmoothing = input<number>(1);
  readonly wwwSquirclePreserveSmoothing = input<boolean>(true);
  readonly wwwSquircleBorderWidth = input<number>(0);
  readonly wwwSquircleBorderColor = input<string>('transparent');
  readonly box = signal<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  readonly wwwSquircleWidth = computed(() => `${this.box().width}px`);
  readonly wwwSquircleHeight = computed(() => `${this.box().height}px`);
  readonly borderBox = computed(() => {
    const { width, height } = this.box();
    const border = this.wwwSquircleBorderWidth();

    return {
      width: width + border * 2,
      height: height + border * 2,
    };
  });
  readonly cornerRadius = computed(() => {
    const parts = this.wwwSquircle().split(' ');

    if (parts.length === 1) {
      return {
        topLeft: Number(parts[0]),
        topRight: Number(parts[0]),
        bottomLeft: Number(parts[0]),
        bottomRight: Number(parts[0]),
      };
    }

    if (parts.length === 2) {
      return {
        topLeft: Number(parts[0]),
        topRight: Number(parts[0]),
        bottomLeft: Number(parts[1]),
        bottomRight: Number(parts[1]),
      };
    }

    if (parts.length === 4) {
      return {
        topLeft: Number(parts[0]),
        topRight: Number(parts[1]),
        bottomLeft: Number(parts[2]),
        bottomRight: Number(parts[3]),
      };
    }

    throw new Error('Invalid squircle');
  });
  readonly path = computed(() => {
    const { topLeft, topRight, bottomLeft, bottomRight } = this.cornerRadius();

    return getSvgPath({
      height: this.box().height,
      width: this.box().width,
      topLeftCornerRadius: topLeft,
      topRightCornerRadius: topRight,
      bottomLeftCornerRadius: bottomLeft,
      bottomRightCornerRadius: bottomRight,
      cornerSmoothing: this.wwwSquircleSmoothing(),
      preserveSmoothing: this.wwwSquirclePreserveSmoothing(),
    });
  });
  readonly clipPathPropertyValue = computed(() => {
    return `path('${this.path()}')`;
  });
  readonly borderImageUrl = computed(() => {
    const path = this.path();
    const border = this.wwwSquircleBorderWidth();
    const computedBorderColor = this.isBrowser
      ? getComputedStyle(this.host.nativeElement).getPropertyValue(
          '--www-squircle-border-color',
        )
      : this.wwwSquircleBorderColor();

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
        <path d="${path}" fill="none" style="stroke: ${computedBorderColor}; stroke-width: ${border};" />
      </svg>
    `;

    const base64 =
      typeof btoa === 'function'
        ? btoa(svg)
        : Buffer.from(svg).toString('base64');

    return `url("data:image/svg+xml;base64,${base64}")`;
  });

  private readBox() {
    if (!this.isBrowser) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.box.set({ width: rect.width, height: rect.height });
  }

  private resizeObserver?: ResizeObserver;

  constructor() {
    afterRenderEffect({
      read: () => {
        this.readBox();
      },
      write: () => {
        if (!this.isBrowser) return;
        if (!this.resizeObserver) {
          this.resizeObserver = new ResizeObserver(() => {
            this.readBox();
          });
        }
        this.resizeObserver.observe(this.host.nativeElement);
      },
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }
}
