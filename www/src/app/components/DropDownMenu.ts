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
      type="button"
      cdkOverlayOrigin
      [wwwSquircle]="squircle()"
      [attr.aria-haspopup]="'menu'"
      [attr.aria-expanded]="isOpen()"
      #trigger="cdkOverlayOrigin"
    >
      <ng-content select="label"></ng-content>
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayPositions]="positions()"
      [cdkConnectedOverlayPanelClass]="'dropdown-panel'"
      (detach)="onOverlayDetach()"
    >
      <div
        #overlayContent
        (mouseenter)="onOverlayEnter()"
        (mouseleave)="onOverlayLeave()"
        role="menu"
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
    },
  ]);
  openMode = input<'click' | 'hover'>('click');

  open = signal(false);
  isPointerOverTrigger = signal(false);
  isPointerOverOverlay = signal(false);

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

  onOverlayDetach() {
    if (this.openMode() === 'click') {
      this.open.set(false);
    } else {
      this.isPointerOverTrigger.set(false);
      this.isPointerOverOverlay.set(false);
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

  @HostListener('document:click', ['$event.target'])
  onClickOutside(target: HTMLElement) {
    const hostContains = this.el.nativeElement.contains(target);
    const overlayContains =
      !!this.overlayContent()?.nativeElement.contains(target);
    if (
      this.openMode() === 'click' &&
      this.open() &&
      !hostContains &&
      !overlayContains
    ) {
      this.open.set(false);
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
}
