import { Component, input, model } from '@angular/core';
import { Markdown } from '../pipes/Markdown';

@Component({
  selector: 'www-code-example-group-item',
  imports: [Markdown],
  template: `
    @if (index() === selfIndex()) {
      <div [innerHTML]="content() | markdown"></div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class CodeExampleGroupItem {
  content = input.required<string>();
  header = input.required<string>();
  index = model<number>(0);
  selfIndex = model<number>(0);
}
