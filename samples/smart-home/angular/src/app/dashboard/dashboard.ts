import { Component, inject } from '@angular/core';
import { LightCard } from '../lights/light-card';
import { SmartHome } from '../smart-home';
import { SceneButton } from '../scenes/scene-button';
import { FabSpeedDial } from './fab-speed-dial';
import { ChatPanelComponent } from '../chat/chat-panel';

@Component({
  selector: 'app-dashboard',
  imports: [LightCard, SceneButton, FabSpeedDial, ChatPanelComponent],
  template: `
    <main>
      <section>
        <h2>Scenes</h2>
        @for (scene of smartHome.scenes(); track scene.id) {
          <app-scene-button [sceneId]="scene.id" />
        }
      </section>
      <section>
        <h2>Lights</h2>
        @for (light of smartHome.lights(); track light.id) {
          <app-light-card [lightId]="light.id" />
        }
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
    }

    main {
      overflow-y: auto;
      padding: 24px;
    }

    h2 {
      font: var(--mat-sys-headline-small);
      padding: 0 8px;
      margin: 0 0 8px;
    }

    section {
      display: block;
      margin: 0 0 24px;
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
}
