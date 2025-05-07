import { Component, input } from '@angular/core';
import { MarkdownComponent } from 'ngx-markdown';

@Component({
  selector: 'www-markdown',
  imports: [MarkdownComponent],
  template: '<markdown [data]="data()"></markdown>',
})
export class Markdown {
  data = input.required<string>();
}
