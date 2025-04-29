import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowUpRight } from '../icons/ArrowUpRight';

@Component({
  selector: 'www-hero',
  imports: [RouterLink, ArrowUpRight],
  template: `
    <div class="container">
      <h1>Open source TypeScript library for building intelligent web apps</h1>
      <p>
        Add intelligence to your Angular or React web apps using our free, open
        source, headless TypeScript library.
      </p>
      <div class="actions">
        <a routerLink="/docs/angular/start/quick">
          Angular
          <www-arrow-up-right />
        </a>
        <a routerLink="/docs/start/quick">
          React
          <www-arrow-up-right />
        </a>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      padding: 64px;
      max-width: 960px;
      margin: 0 auto;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
    }

    h1,
    p {
      text-align: center;
    }

    h1 {
      font: 48px/56px sans-serif;
    }

    .actions {
      display: flex;
      align-content: center;
      gap: 16px;

      a {
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(255, 255, 255, 0.86);
        text-transform: uppercase;
        font: 500 12px/16px sans-serif;
        background: rgba(255, 255, 255, 0.08);
        padding: 12px 24px;
        border-radius: 9999px;
      }
    }
  `,
})
export class Hero {}
