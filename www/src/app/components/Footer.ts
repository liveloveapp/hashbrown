import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'www-footer',
  imports: [RouterLink],
  template: `
    <footer>
      <nav>
        <ul>
          <li><a routerLink="/">Home</a></li>
        </ul>
      </nav>
    </footer>
  `,
  styles: `
    :host {
      display: block;
    }

    footer {
      display: flex;
      justify-content: space-between;
      padding: 32px;
    }
  `,
})
export class Footer {}
