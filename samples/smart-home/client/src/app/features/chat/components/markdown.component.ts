import { Component, input, ViewEncapsulation } from '@angular/core';
import { MarkdownComponent as NgxMarkdownComponent } from 'ngx-markdown';

@Component({
  selector: 'app-markdown',
  standalone: true,
  imports: [NgxMarkdownComponent],
  template: '<markdown [data]="data()" class="app-markdown"></markdown>',
  encapsulation: ViewEncapsulation.None,
  styles: `
    .app-markdown {
      display: block;
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
    }

    .app-markdown h1,
    .app-markdown h2,
    .app-markdown h3,
    .app-markdown h4,
    .app-markdown h5,
    .app-markdown h6 {
      font-weight: bold;
      margin: 1em 0 0.5em;
    }

    .app-markdown p {
      margin: 0.5em 0;
    }

    .app-markdown a {
      color: #007bff;
      text-decoration: none;
    }

    .app-markdown a:hover {
      text-decoration: underline;
    }

    .app-markdown ul,
    .app-markdown ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
    }

    .app-markdown ul {
      list-style: disc;
    }

    .app-markdown ol {
      list-style: decimal;
    }

    .app-markdown li {
      margin: 0.5em 0;
    }

    .app-markdown blockquote {
      margin: 0.5em 0;
      padding: 0.5em 1em;
      background-color: #f9f9f9;
      border-left: 5px solid #ccc;
    }

    .app-markdown code {
      font-family: 'Courier New', Courier, monospace;
      background-color: #f4f4f4;
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }

    .app-markdown :first-child {
      margin-top: 0;
    }

    .app-markdown :last-child {
      margin-bottom: 0;
    }
  `,
})
export class MarkdownComponent {
  data = input<string>('');
}
