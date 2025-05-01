import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowUpRight } from '../icons/ArrowUpRight';

@Component({
  selector: 'www-hero',
  imports: [RouterLink, ArrowUpRight],
  template: `
    <div class="bleed">
      <div class="container">
        <h1>
          Open source TypeScript library for building intelligent web apps
        </h1>
        <p>
          Add intelligence to your Angular or React web apps using our free,
          open source, headless TypeScript library.
        </p>
        <div class="actions">
          <a routerLink="/docs/angular/start/quick">
            Angular
            <www-arrow-up-right />
          </a>
          <a routerLink="/docs/react/start/quick">
            React
            <www-arrow-up-right />
          </a>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      background: #f9bd3f;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      padding: 128px 64px;
      max-width: 960px;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      color: #7d542f;
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
        color: rgba(125, 84, 47, 0.88);
        text-transform: uppercase;
        font: 600 12px/16px sans-serif;
        padding: 12px 24px;
        border: 2px solid rgba(125, 84, 47, 0.56);
        border-radius: 9999px;
        transition:
          color 0.2s ease-in-out,
          border 0.2s ease-in-out;

        &:hover {
          color: rgb(125, 84, 47);
          border-color: rgb(125, 84, 47);
        }
      }
    }
  `,
})
export class Hero {}
