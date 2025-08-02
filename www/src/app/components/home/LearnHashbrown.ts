import { Component } from '@angular/core';

@Component({
  selector: 'www-learn-hashbrown',
  template: `
    <div class="bleed">
      <h2>The Generative UI Framework for Engineers</h2>
      <p>
        Hashbrown is the open-source framework for building generative user
        interfaces. It works with your React or Angular components, your LLM
        provider, and it integrates with your existing API layer.
      </p>
      <menu>
        <ol>
          <li>
            <h3>Generative User Interfaces</h3>
            <p>
              Expose your React or Angular components to an LLM, and let it
              generate a full UI
            </p>
          </li>
          <li>
            <h3>JavaScript Runtime</h3>
            <p>
              Use LLMs to generate and run JavaScript for truly next-gen user
              interactions
            </p>
          </li>
          <li>
            <h3>Streaming Responses</h3>
            <p>
              Stream text, data, and UI from LLMs to your app, with full type
              safety along the way
            </p>
          </li>
        </ol>
      </menu>
      <div class="content">
        <div class="player">
          <!-- todo -->
        </div>
        <div class="instructions">
          <!-- todo -->
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
    }

    .bleed {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;

      > .title {
        dis
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        grid-template-columns: 348px auto;
      }
    }
  `,
})
export class LearnHashbrown {}
