import { Component, input, Input } from '@angular/core';

export type AlertType = 'info' | 'warn' | 'error' | 'help';

@Component({
  selector: 'www-alert',
  template: ` <ng-content></ng-content> `,
  host: {
    '[class.infor]': 'isInfo',
    '[class.warn]': 'isWarn',
    '[class.error]': 'isError',
    '[class.help]': 'isHelp',
  },
  styles: [
    `
      :host {
        display: block;
        padding: 16px;
        margin: 16px 0;
        border-left: 8px solid;
        border-top: 1px solid;
        border-bottom: 1px solid;
        border-right: 1px solid;
        border-color: rgba(255, 255, 255, 0.12);
      }

      :host p {
        margin: 0;
      }

      :host(.info) {
        border-color: rgb(97, 174, 238);
        background-color: rgba(97, 174, 238, 0.12);
      }

      :host(.warn) {
        border-color: rgb(255, 184, 113);
        background-color: rgba(255, 184, 113, 0.12);
      }

      :host(.error) {
        border-color: rgb(220, 53, 69);
        background-color: rgba(220, 53, 69, 0.12);
      }

      :host(.help) {
        border-color: rgba(255, 172, 230, 0.72);
        background-color: rgba(255, 172, 230, 0.08);
      }

      :host + h2 {
        margin-top: 0;
      }
    `,
  ],
})
export class Alert {
  type = input<AlertType>('info');

  get isInfo() {
    return this.type() === 'info';
  }

  get isWarn() {
    return this.type() === 'warn';
  }

  get isError() {
    return this.type() === 'error';
  }

  get isHelp() {
    return this.type() === 'help';
  }
}
