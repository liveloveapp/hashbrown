import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
} from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-dropdown-menu',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Squircle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      (click)="onTriggerClick()"
      (mouseenter)="onTriggerEnter()"
      (mouseleave)="onTriggerLeave()"
      [attr.aria-controls]="menuId"
      [attr.aria-expanded]="isOpen() ? 'true' : 'false'"
      [attr.aria-haspopup]="'menu'"
      [wwwSquircle]="squircle()"
      #trigger="cdkOverlayOrigin"
      cdkOverlayOrigin
      type="button"
    >
      <ng-content select="label"></ng-content>
    </button>
    <ng-template
      (detach)="onOverlayDetach()"
      (overlayOutsideClick)="onOverlayOutsideClick()"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayPanelClass]="'dropdown-panel'"
      [cdkConnectedOverlayPositions]="positions()"
      cdkConnectedOverlay
    >
      <div
        (click)="onOverlayClick()"
        (mouseenter)="onOverlayEnter()"
        (mouseleave)="onOverlayLeave()"
        [attr.id]="menuId"
        #overlayContent
        role="menu"
        tabindex="-1"
      >
        <ng-content select="[content]"></ng-content>
      </div>
    </ng-template>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: inline-block;
      }

      button {
        display: flex;
        align-items: center;
        gap: 4px;
        border: none;
        background: none;
        cursor: pointer;

        > label {
          cursor: pointer;
        }
      }

      ::ng-deep.dropdown-panel {
        display: flex;
      }
    `,
  ],
})
export class DropdownMenu {
  squircle = input<string>('8');
  positions = input<ConnectedPosition[]>([
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 4,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -4,
    },
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 4,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -4,
    },
  ]);
  openMode = input<'click' | 'hover'>('click');

  open = signal(false);
  isPointerOverTrigger = signal(false);
  isPointerOverOverlay = signal(false);

  menuId = 'www-dropdown-' + Math.random().toString(36).slice(2);

  private overlayTimeoutId: number | undefined;
  private triggerTimeoutId: number | undefined;

  isOpen = computed(() => {
    return this.openMode() === 'hover'
      ? this.isPointerOverTrigger() || this.isPointerOverOverlay()
      : this.open();
  });

  overlayContent = viewChild<ElementRef<HTMLElement>>('overlayContent');

  onTriggerClick() {
    if (this.openMode() === 'click') {
      this.open.set(!this.open());
    }
  }

  onTriggerEnter() {
    if (this.openMode() === 'hover') {
      this.clearTriggerTimeout();
      this.isPointerOverTrigger.set(true);
    }
  }

  onOverlayEnter() {
    if (this.openMode() === 'hover') {
      this.clearOverlayTimeout();
      this.isPointerOverOverlay.set(true);
    }
  }

  onOverlayLeave() {
    if (this.openMode() === 'hover') {
      this.clearOverlayTimeout();
      this.overlayTimeoutId = window.setTimeout(() => {
        this.isPointerOverOverlay.set(false);
      }, 200);
    }
  }

  onOverlayClick() {
    if (this.openMode() === 'click') {
      this.open.set(false);
    }
  }

  onOverlayDetach() {
    if (this.openMode() === 'click') {
      this.open.set(false);
      const triggerButton = this.el.nativeElement.querySelector(
        'button',
      ) as HTMLButtonElement | null;
      triggerButton?.focus();
    } else {
      this.isPointerOverTrigger.set(false);
      this.isPointerOverOverlay.set(false);
    }
  }

  onOverlayOutsideClick() {
    if (this.openMode() === 'click' && this.open()) {
      this.open.set(false);
    }
  }

  private clearOverlayTimeout() {
    if (this.overlayTimeoutId !== undefined) {
      clearTimeout(this.overlayTimeoutId);
      this.overlayTimeoutId = undefined;
    }
  }

  private clearTriggerTimeout() {
    if (this.triggerTimeoutId !== undefined) {
      clearTimeout(this.triggerTimeoutId);
      this.triggerTimeoutId = undefined;
    }
  }

  onTriggerLeave() {
    if (this.openMode() === 'hover') {
      this.clearTriggerTimeout();
      this.triggerTimeoutId = window.setTimeout(() => {
        this.isPointerOverTrigger.set(false);
      }, 200);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (this.openMode() === 'click') {
        if (this.open()) {
          this.open.set(false);
        }
      } else {
        this.isPointerOverTrigger.set(false);
        this.isPointerOverOverlay.set(false);
      }
    }
  }

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnDestroy() {
    this.clearOverlayTimeout();
    this.clearTriggerTimeout();
  }
}
