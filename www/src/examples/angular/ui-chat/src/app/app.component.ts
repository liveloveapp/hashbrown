import { Component, inject, resource } from '@angular/core';
import { ChatComponent } from './components/chat.component';
import { ConfigComponent } from './components/config.component';
import { LightComponent } from './components/light.component';
import { Light } from './models/light';
import { LightsStore } from './store/lights.store';

@Component({
  selector: 'app-root',
  imports: [ChatComponent, ConfigComponent, LightComponent],
  providers: [LightsStore],
  template: `
    <div class="app">
      <app-config />
      <div class="lights">
        <h3>Lights</h3>
        @for (light of lightsResource.value(); track light.id) {
          <button>
            <app-light [lightId]="light.id" (change)="onChange($event)" />
          </button>
        }
      </div>
      <app-chat />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      background: rgba(61, 60, 58, 0.08);
      height: 100%;
    }

    .app {
      flex: 1 auto;
      display: grid;
      grid-template-columns: 1fr;
      grid-template-rows: 42px 1fr 2fr;
      height: 100%;
      gap: 16px;
      padding: 16px;
    }

    .lights {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
      padding: 16px;
      background: #fff;
      border-radius: 12px;
      overflow-y: auto;

      > h3 {
        color: rgba(61, 60, 58, 0.88);
        font: 600 12px/18px sans-serif;
        text-transform: uppercase;
      }
    }

    @media screen and (min-width: 768px) {
      .app {
        grid-template-columns: 320px 1fr;
        grid-template-rows: 42px auto;

        > app-config {
          grid-column: 1 / span 2;
          grid-row: 1;
        }

        > .lights {
          grid-column: 1;
          grid-row: 2;
        }

        > app-chat {
          grid-column: 2;
          grid-row: 2;
        }
      }

      .lights {
        max-height: inherit;
      }
    }

    @media screen and (min-width: 1024px) {
      .app {
        grid-template-columns: 400px auto;
      }
    }
  `,
})
export class App {
  lightsStore = inject(LightsStore);

  lightsResource = resource({
    loader: () => {
      const lights = this.lightsStore.entities();
      return Promise.resolve(lights);
    },
  });

  onChange(args: { id: string; changes: Partial<Light> }) {
    this.lightsStore.updateLight(args.id, args.changes);
  }
}
