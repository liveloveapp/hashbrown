import { Component } from '@angular/core';

@Component({
  selector: 'www-next-steps',
  template: `
    <ul class="next-steps">
      <ng-content></ng-content>
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }

    .next-steps {
      display: flex;
      flex-direction: column;
      gap: 16px;
      list-style: none;
      padding: 0;
      margin: 8px 0 16px 0;
    }
  `,
})
export class NextSteps {}
