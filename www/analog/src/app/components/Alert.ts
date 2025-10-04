import { Component, input } from '@angular/core';

export type AlertType = 'info' | 'warn' | 'error' | 'help';

@Component({
  selector: 'www-alert',
  template: `
    @if (header()) {
      <div class="header">
        <span>{{ header() }}</span>
      </div>
    }
    <div class="content">
      <ng-content />
    </div>
  `,
  host: {
    '[class.info]': 'isInfo',
    '[class.warn]': 'isWarn',
    '[class.error]': 'isError',
    '[class.help]': 'isHelp',
  },
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        border: 1px solid #000;
        border-radius: 12px;
      }

      .header {
        display: flex;
        justify-content: space-between;
        padding: 8px 16px;
        border-bottom: 1px solid;
        font-size: 12px;
        font-weight: 500;
        color: rgba(61, 60, 58, 0.88);

        > button {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }

      .content {
        padding: 16px;
      }

      :host p {
        margin: 0;
      }

      :host(.info) {
        border-color: rgb(97, 174, 238);
        background-color: rgba(97, 174, 238, 0.12);

        .header {
          border-color: rgb(97, 174, 238);
        }
      }

      :host(.warn) {
        border-color: rgb(255, 184, 113);
        background-color: rgba(255, 184, 113, 0.12);

        .header {
          border-color: rgb(255, 184, 113);
        }
      }

      :host(.error) {
        border-color: rgb(220, 53, 69);
        background-color: rgba(220, 53, 69, 0.12);

        .header {
          border-color: rgb(220, 53, 69);
        }
      }

      :host(.help) {
        border-color: rgba(255, 172, 230, 0.72);
        background-color: rgba(255, 172, 230, 0.08);

        .header {
          border-color: rgba(255, 172, 230, 0.72);
        }
      }
    `,
  ],
})
export class Alert {
  type = input<AlertType>('info');
  header = input<string>('');

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
