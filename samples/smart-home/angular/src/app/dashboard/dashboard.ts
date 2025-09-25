import { afterNextRender, Component, inject } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { LightCard } from '../lights/light-card';
import { SmartHome } from '../smart-home';
import { SceneButton } from '../scenes/scene-button';
import { FabSpeedDial } from './fab-speed-dial';
import { ChatPanelComponent } from '../chat/chat-panel';
import { Squircle } from '../squircle';
import { openWelcomeOverlay } from './welcome';

@Component({
  selector: 'app-dashboard',
  imports: [LightCard, SceneButton, FabSpeedDial, ChatPanelComponent, Squircle],
  template: `
    <main>
      <header
        appSquircle="16"
        [appSquircleBorderWidth]="2"
        appSquircleBorderColor="rgba(0, 0, 0, 0.12)"
      >
        <div class="brand">
          <a href="https://hashbrown.dev" target="_blank">
            <img src="/brand-mark.svg" alt="Hashbrown" height="32" />
          </a>
          <h1>Smart Home</h1>
        </div>
        <button type="button" class="tour-button" (click)="openWelcome()">
          Welcome tour
        </button>
      </header>
      <section>
        <h2>Scenes</h2>
        <div class="scenes">
          @for (scene of smartHome.scenes(); track scene.id) {
            <app-scene-button [sceneId]="scene.id" />
          }
        </div>
      </section>
      <section>
        <h2>Lights</h2>
        <div class="lights">
          @for (light of smartHome.lights(); track light.id) {
            <app-light-card [lightId]="light.id" />
          }
        </div>
      </section>
      <app-fab-speed-dial />
    </main>
    <app-chat-panel />
  `,
  styles: `
    :host {
      display: grid;
      --chat-width: 480px;
      height: 100dvh;
      grid-template-columns: 1fr var(--chat-width);
      background: var(--vanilla-ivory, #faf9f0);
    }

    main {
      display: flex;
      flex-direction: column;
      gap: 32px;
      overflow-y: auto;
      padding: 24px;

      > header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        background: #fff;
        padding: 16px;

        > .brand {
          display: flex;
          align-items: center;
          gap: 16px;

          > h1 {
            margin: 0;
          }
        }

        > .tour-button {
          border: none;
          border-radius: 9999px;
          background: var(--sunshine-yellow-light, #fde4ba);
          color: var(--chocolate-brown, #774625);
          font:
            600 12px / 16px Fredoka,
            sans-serif;
          padding: 8px 14px;
          cursor: pointer;
          transition: background 120ms ease;
        }

        > .tour-button:hover,
        > .tour-button:focus-visible {
          background: var(--sunshine-yellow, #f9ce77);
          outline: none;
        }
      }

      > section {
        > h2 {
          padding: 0 8px;
          margin: 0 0 8px;
          color: var(--chocolate-brown, #774625);
          font:
            600 14px / 16px Fredoka,
            sans-serif;
        }

        > .scenes {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }

        > .lights {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
      }
    }

    app-fab-speed-dial {
      position: fixed;
      right: calc(var(--chat-width) + 24px);
      bottom: 24px;
    }
  `,
})
export class Dashboard {
  readonly smartHome = inject(SmartHome);
  private readonly overlay = inject(Overlay);

  constructor() {
    afterNextRender(() => openWelcomeOverlay(this.overlay));
  }

  protected openWelcome() {
    openWelcomeOverlay(this.overlay);
  }
}
