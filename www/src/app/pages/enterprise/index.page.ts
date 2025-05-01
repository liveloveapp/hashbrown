import { Component } from '@angular/core';

@Component({
  imports: [],
  template: ` <h1>Enterprise</h1> `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 auto;
      }
    `,
  ],
})
export default class EnterpriseIndexPage {}
