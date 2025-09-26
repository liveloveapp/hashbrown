import { Component } from '@angular/core';
import { Squircle } from '../../components/Squircle';

@Component({
  imports: [Squircle],
  template: `
    <main class="container" wwwSquircle="16 16 0 0">
      <iframe src="https://smart-home.hashbrown.dev"></iframe>
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .container {
      display: flex;
      flex-direction: column;
      background: #fff;
      height: 100%;

      > iframe {
        flex: 1 auto;
        width: 100%;
        border: none;
      }
    }
  `,
})
export default class SmartHomeSamplePage {}
