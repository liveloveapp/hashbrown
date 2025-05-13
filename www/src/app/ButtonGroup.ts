import {
  AfterViewInit,
  Component,
  input,
  model,
  Type,
  viewChildren,
  ViewContainerRef,
} from '@angular/core';

@Component({
  selector: 'www-button-group',
  template: `
    @for (option of options(); track option.value) {
      <button
        [class.active]="option.value === value()"
        (click)="value.set(option.value)"
      >
        @if (option.icon) {
          <ng-container #icon></ng-container>
        }
        {{ option.label }}
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      border-radius: 8px;
      border: 1px solid rgba(0, 0, 0, 0.12);
      background: #5e5c5a;
      width: auto;
    }

    button {
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: transparent;
      border: none;
      font:
        500 16px/24px Fredoka,
        sans-serif;
      cursor: pointer;
      opacity: 0.4;
      transition: opacity 0.2s ease-in-out;

      svg {
        width: 16px !important;
        height: 16px !important;
      }

      &.active,
      &:hover {
        opacity: 1;
      }
    }

    button:not(:last-child) {
      border-right: 1px solid rgba(0, 0, 0, 0.12);
    }
  `,
})
export class ButtonGroup implements AfterViewInit {
  options =
    input.required<{ label: string; value: string; icon?: Type<unknown> }[]>();
  value = model<string>('');
  hosts = viewChildren('icon', { read: ViewContainerRef });

  ngAfterViewInit() {
    this.hosts().forEach((host, index) => {
      const iconComponent = this.options()[index].icon;
      if (iconComponent) {
        host.createComponent(iconComponent);
      }
    });
  }
}
