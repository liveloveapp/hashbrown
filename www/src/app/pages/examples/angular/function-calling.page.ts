import { Component } from '@angular/core';
import { Stackblitz } from '../../../components/Stackblitz';

@Component({
  imports: [Stackblitz],
  template: `<www-stackblitz name="angular/function-calling" />`,
  styles: `
    :host {
      flex: 1 auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
  `,
})
export default class FunctionCallingPage {}
