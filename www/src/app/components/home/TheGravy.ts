import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'www-the-gravy',
  imports: [RouterLink],
  template: ` <div class="bleed"></div> `,
  styles: [
    `
      :host {
        position: relative;
        display: flex;
        justify-content: center;
        width: 100%;
        background: #faf9f0;
      }

      .bleed {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 64px;
        padding: 64px 32px;
        width: 100%;
        max-width: 720px;
      }
    `,
  ],
})
export class TheGravy {}
