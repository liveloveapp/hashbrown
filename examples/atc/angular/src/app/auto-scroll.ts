import { isNearBottom } from '@atc/shared';
import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/**
 * Keeps a scroller pinned to its newest content while an answer streams. When
 * the user scrolls up it stops following, so they are never yanked back; their
 * own new message pins it again.
 */
@Directive({
  selector: '[atcAutoScroll]',
  host: { '(scroll)': 'track()' },
})
export class AutoScrollDirective {
  private readonly element =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private pinned = true;

  constructor() {
    const observer = new MutationObserver((records) => {
      if (records.some((record) => this.addsUserMessage(record))) {
        this.pinned = true;
      }
      if (this.pinned) {
        this.element.scrollTop = this.element.scrollHeight;
      }
    });
    observer.observe(this.element, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  protected track(): void {
    this.pinned = isNearBottom(this.element);
  }

  private addsUserMessage(record: MutationRecord): boolean {
    return [...record.addedNodes].some(
      (node) => node instanceof Element && node.matches('.atc-user'),
    );
  }
}
