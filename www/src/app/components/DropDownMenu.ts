import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
} from '@angular/cdk/overlay';
import {
  Component,
  ElementRef,
  HostListener,
  input,
  signal,
} from '@angular/core';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-dropdown-menu',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Squircle],
  template: `
    <button
      (click)="open.set(!open())"
      type="button"
      cdkOverlayOrigin
      [wwwSquircle]="squircle()"
      #trigger="cdkOverlayOrigin"
    >
      <ng-content select="label"></ng-content>
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions()"
      [cdkConnectedOverlayPanelClass]="'dropdown-panel'"
      (detach)="open.set(false)"
    >
      <ng-content select="[content]"></ng-content>
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
        padding: 16px;
        border-radius: 16px;
        box-shadow: 0 8px 16px 2px rgba(0, 0, 0, 0.12);
        background: #fff;
        backdrop-filter: blur(24px);
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
