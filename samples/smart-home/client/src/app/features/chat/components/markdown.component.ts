import { Component, input, Input } from '@angular/core';
import { MarkdownComponent as NgxMarkdownComponent } from 'ngx-markdown';

@Component({
  selector: 'app-markdown',
  standalone: true,
  imports: [NgxMarkdownComponent],
  template: '<markdown [data]="data()"></markdown>',
})
export class MarkdownComponent {
  data = input.required<string>();
}
