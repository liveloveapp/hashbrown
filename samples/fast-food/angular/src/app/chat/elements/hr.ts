import { Component } from '@angular/core';

@Component({
  selector: 'app-hr',
  template: ` <hr /> `,
  styles: `
    :host {
      display: block;
      margin: 12px 0;
      width: var(--article-width);
    }

    hr {
      width: 70%;
      border: 0;
      border-top: 1px solid rgba(0, 0, 0, 0.12);
      transition: width 0.3s ease;
      margin-left: 0;
      margin-right: auto;
      display: block;

      @starting-style {
        width: 0;
      }
    }
  `,
})
export class HorizontalRule {}
