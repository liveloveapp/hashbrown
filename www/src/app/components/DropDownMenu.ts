import {
  Component,
  ElementRef,
  HostListener,
  input,
  signal,
} from '@angular/core';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
} from '@angular/cdk/overlay';
import { Glass } from './Glass';

@Component({
  selector: 'www-dropdown-menu',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Glass],
  template: `
    <button
      (click)="open.set(!open())"
      type="button"
      cdkOverlayOrigin
      #trigger="cdkOverlayOrigin"
    >
      <ng-content select="label"></ng-content>
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPanelClass]="'dropdown-panel'"
      (detach)="open.set(false)"
    >
      <www-glass>
        <ng-content select="[content]"></ng-content>
      </www-glass>
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

      ::ng-deep www-glass {
        display: flex;
        gap: 4px;
        padding: 16px;
        border-radius: 8px;
        box-shadow:
          0 10px 15px -3px rgba(0, 0, 0, 0.16),
          0 4px 6px -4px rgba(0, 0, 0, 0.16);
      }
    `,
  ],
})
export class DropdownMenu {
  positions = input<ConnectedPosition[]>([
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
    },
  ]);
  open = signal(false);

  @HostListener('document:click', ['$event.target'])
  onClickOutside(target: HTMLElement) {
    if (this.open() && !this.el.nativeElement.contains(target)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.open()) {
      this.open.set(false);
    }
  }

  constructor(private el: ElementRef<HTMLElement>) {}
}
