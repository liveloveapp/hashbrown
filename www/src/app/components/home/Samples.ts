import { Component } from '@angular/core';

@Component({
  selector: 'www-samples',
  template: `
    <div class="bleed">
      <ul>
        <li>
          <a href="https://github.com/liveloveapp/hashbrown">
            <div class="header">
              <h2>Break Out of the Chat Box</h2>
              <p>
                The web is more than text and links. AI can be too. With
                Hashbrown, your users can interact with your apps using plain
                speech instead of rigid menus. The result is faster workflows,
                happier users, and products that feel fresh.
              </p>
            </div>
            <div class="window">
              <div class="header">
                <h3>Finance Sample</h3>
              </div>
              <div class="content">todo</div>
            </div>
          </a>
        </li>
        <li>
          <a href="https://github.com/liveloveapp/hashbrown">
            <div class="header">
              <h2>Build Visibility Into Apps and Features</h2>
              <p>
                Apps with Hashbrown can show their work dynamically and
                automatically
              </p>
            </div>
            <div class="window">
              <div class="header">
                <h3>Finance Sample</h3>
              </div>
              <div class="content">todo</div>
            </div>
          </a>
        </li>
        <li>
          <a href="https://github.com/liveloveapp/hashbrown">
            <div class="header">
              <h2>Speed Up Workflows with AI Shortcuts</h2>
              <p>
                Traditional app navigation is cumbersome. Your users want to
                learn, explore, and do. With Hashbrown, give your users what
                they want faster and easier by predicting their next action.
              </p>
            </div>
            <div class="window">
              <div class="header">
                <h3>Smart Home Sample</h3>
              </div>
              <div class="content">todo</div>
            </div>
          </a>
        </li>
      </ul>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
  `,
})
export class Samples {}
