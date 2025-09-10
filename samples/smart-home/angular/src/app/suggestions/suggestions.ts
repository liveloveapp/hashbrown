import { Component, computed, inject, Signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SmartHome } from '../smart-home';
import { Suggestor } from './suggestor';
import { Light, Scene, SceneLight } from '../types';

@Component({
  selector: 'app-suggestions',
  template: `
    @if (error()) {
      <div class="error">
        <mat-icon inline>error</mat-icon>Suggestion is not available.
      </div>
    }
    <!-- Loop over suggestions and display according to type -->
    @for (suggestion of suggestions(); track $index) {
      @switch (suggestion.type) {
        @case ('Create Scene') {
          <div class="suggestion">
            <div class="suggestionIcon">
              <mat-icon inline>bolt</mat-icon>
            </div>
            <p>
              Create Scene called "<span class="suggestionValue">{{
                suggestion.name
              }}</span
              >" with
              <span class="suggestionValue">{{
                suggestion.lights.length
              }}</span>
              lights
            </p>
            <div class="suggestionActions">
              <button
                class="rejectSuggestion"
                (click)="removeSuggestion($index)"
              >
                Dismiss
              </button>
              <button
                class="acceptSuggestion"
                (click)="
                  addScene($index, {
                    name: suggestion.name,
                    lights: suggestion.lights,
                  })
                "
              >
                Accept
              </button>
            </div>
          </div>
        }
        @case ('Add Light to Scene') {
          @let light = getLight(suggestion.lightId)();
          @let scene = getScene(suggestion.sceneId)();

          <div class="suggestion">
            <div class="suggestionIcon">
              <mat-icon inline>bolt</mat-icon>
            </div>
            <p>
              Add Light "<span class="suggestionValue">{{ light?.name }}</span
              >" to Scene "<span class="suggestionValue">{{ scene?.name }}</span
              >" with brightness
              <span class="suggestionValue">{{ suggestion.brightness }}</span>
            </p>
            <div class="suggestionActions">
              <button
                class="rejectSuggestion"
                (click)="removeSuggestion($index)"
              >
                Dismiss
              </button>
              <button
                class="acceptSuggestion"
                (click)="
                  addLightToScene($index, suggestion.sceneId, {
                    lightId: suggestion.lightId,
                    brightness: suggestion.brightness,
                  })
                "
              >
                Accept
              </button>
            </div>
          </div>
        }
        @case ('Remove Light from Scene') {
          @let light = getLight(suggestion.lightId)();
          @let scene = getScene(suggestion.sceneId)();

          <div class="suggestion">
            <div class="suggestionIcon">
              <mat-icon inline>remove_circle</mat-icon>
            </div>
            <p>
              Remove Light "<span class="suggestionValue">{{
                light?.name
              }}</span
              >" from Scene "<span class="suggestionValue">{{
                scene?.name
              }}</span
              >"
            </p>
            <div class="suggestionActions">
              <button
                class="rejectSuggestion"
                (click)="removeSuggestion($index)"
              >
                Dismiss
              </button>
              <button
                class="acceptSuggestion"
                (click)="
                  removeLightFromScene(
                    $index,
                    suggestion.lightId,
                    suggestion.sceneId
                  )
                "
              >
                Accept
              </button>
            </div>
          </div>
        }
      }
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 1000;
        display: flex;
        flex-direction: column-reverse;
        width: 300px;
        gap: 8px;
      }

      .suggestion {
        background-color: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(8px);
        padding: 16px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 8px;
        display: grid;
        width: 100%;
        grid-template-areas:
          'icon content'
          'actions actions';
        grid-template-columns: 24px 1fr;
        grid-template-rows: 1fr 32px;
        gap: 8px;
      }

      .suggestionIcon {
        grid-area: icon;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        line-height: 24px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .suggestion p {
        grid-area: content;
        font-size: 13px;
        line-height: 1.5;
        color: rgba(0, 0, 0, 0.87);
      }

      .suggestionValue {
        color: rgba(0, 0, 0, 1);
        font-weight: 500;
      }

      .suggestionActions {
        grid-area: actions;
        display: flex;
        align-self: end;
        justify-self: end;
        gap: 8px;
      }

      .suggestion button {
        background-color: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.12);
        padding: 4px;
        font-size: 10px;
        text-transform: uppercase;
      }

      .rejectSuggestion {
        background-color: rgba(255, 255, 255, 255.12);
        border: 1px solid rgba(255, 255, 255, 255.12);
      }

      .suggestion button.acceptSuggestion {
        background-color: var(--mat-sys-primary);
        border: 1px solid var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
      }

      .error {
        background-color: var(--mat-sys-error-container);
        width: fit-content;
        padding: 16px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
    `,
  ],
  imports: [MatIconModule],
})
export class Suggestions {
  private readonly smartHome = inject(SmartHome);
  private readonly suggestor = inject(Suggestor);
  readonly suggestions = this.suggestor.suggestions;
  readonly error = this.suggestor.error;
  readonly isLoading = this.suggestor.isLoading;

  getLight(lightId: string): Signal<Light | undefined> {
    return computed(() => {
      const lights = this.smartHome.lights();
      return lights.find((light) => light.id === lightId);
    });
  }

  getScene(sceneId: string): Signal<Scene | undefined> {
    return computed(() => {
      const scenes = this.smartHome.scenes();
      return scenes.find((scene) => scene.id === sceneId);
    });
  }

  removeSuggestion(index: number) {
    this.suggestor.removeSuggestion(index);
  }

  addScene(
    index: number,
    scene: { name: string; lights: { lightId: string; brightness: number }[] },
  ) {
    this.removeSuggestion(index);
    this.smartHome.addScene(scene);
  }

  addLightToScene(index: number, sceneId: string, sceneLight: SceneLight) {
    this.removeSuggestion(index);
    this.smartHome.addLightToScene(
      sceneLight.lightId,
      sceneId,
      sceneLight.brightness,
    );
  }

  removeLightFromScene(index: number, lightId: string, sceneId: string) {
    this.removeSuggestion(index);
    this.smartHome.removeLightFromScene(lightId, sceneId);
  }
}
