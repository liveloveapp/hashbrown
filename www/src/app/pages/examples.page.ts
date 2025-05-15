import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ExamplesHeader } from '../components/ExamplesHeader';

@Component({
  imports: [RouterOutlet, ExamplesHeader],
  template: `
    <www-examples-header />
    <main class="examples">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .examples {
      flex: 1 auto;
      display: flex;
    }
  `,
})
export default class ExamplesPage {}
