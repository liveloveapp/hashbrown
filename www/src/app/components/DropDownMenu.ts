import {
  Component,
  Input,
  signal,
  HostListener,
  ElementRef,
  input,
} from '@angular/core';
import { ChevronDown } from '../icons/ChevronDown';

@Component({
  selector: 'www-dropdown-menu',
  imports: [ChevronDown],
  template: `
    <button (click)="toggle()">
      <ng-content select="label"></ng-content>
      <www-chevron-down />
    </button>
    <div
      role="menu"
      class="dropdown-panel"
      [style.visibility]="open() ? 'visible' : 'hidden'"
      [style.position]="'absolute'"
      [style.z-index]="'1000'"
      [style.top]="placement()[1] === 'bottom' ? 'calc(100% + 8px)' : null"
      [style.bottom]="placement()[1] === 'top' ? 'calc(100% + 8px)' : null"
      [style.left]="placement()[0] === 'left' ? '0' : null"
      [style.right]="placement()[0] === 'right' ? '0' : null"
    >
      <ng-content select="[content]"></ng-content>
    </div>
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

      .dropdown-panel {
        max-width: 280px;
        background: #fff;
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
  placement = input<['left' | 'right', 'top' | 'bottom']>(['left', 'bottom']);
  open = signal(false);

  constructor(private el: ElementRef<HTMLElement>) {}

  toggle() {
    this.open.update((v) => !v);
  }

  @HostListener('document:click', ['$event.target'])
  onClickOutside(target: HTMLElement) {
    if (this.open() && !this.el.nativeElement.contains(target)) {
      this.open.set(false);
    }
  }
}
