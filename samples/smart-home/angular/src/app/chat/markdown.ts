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
      color: #e0e0e0;
    }

    .app-markdown h1,
    .app-markdown h2,
    .app-markdown h3,
    .app-markdown h4,
    .app-markdown h5,
    .app-markdown h6 {
      font-weight: bold;
      margin: 1em 0 0.5em;
      color: #ff79c6;
    }

    .app-markdown p {
      margin: 0.5em 0;
    }

    .app-markdown a {
      color: #8be9fd;
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
      background-color: #282a36;
      border-left: 5px solid #bd93f9;
    }

    .app-markdown code {
      font-family: 'Courier New', Courier, monospace;
      background-color: #44475a;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      color: #f8f8f2;
    }

    .app-markdown :first-child {
      margin-top: 0;
    }

    .app-markdown :last-child {
      margin-bottom: 0;
    }
  `,
})
export class Markdown {
  data = input<string>('');
}
