import { Component, computed, inject } from '@angular/core';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { Store } from '@ngrx/store';
import { selectAllLights, selectAllScenes } from '../../store';
import { DashboardPageActions } from './actions';
import { SceneCardButtonComponent } from './components/scene-card-button.component';
import { MatIconModule } from '@angular/material/icon';
import {
  LightCardButtonComponent,
  LightIconSchema,
} from './components/light-card-button.component';

export const RoomIconSchema = s.enumeration('Icon for a Group of Lights', [
  'living', // livingRoom
  'kitchen', // kitchen
  'dining', // diningRoom
  'bed', // bedroom
  'bathtub', // bathroom
  'desk', // office
  'garage', // garage
  'local_laundry_service', // laundryRoom
  'door_front', // hallway
  'stairs', // basement
  'roofing', // attic
  'crib', // nursery
  'bedroom_parent', // guestRoom
  'deck', // patio
  'yard', // garden
  'balcony', // balcony
]);

const system = `
You are a helpful assistant that prepares a dashbaord for a user's smart
home. You use the ambient state of the home to prepare the dashboard.

# Schema
The dashboard should be a JSON object with the following properties:
- greeting: A very short, time-based greeting (i.e. "Good morning", "Good evening", "Good night")
- threeBestSceneIds: The ids of the three most important scenes
- rooms: A list of objects with the following properties:
  - roomName: The name of the room
  - lightIds: A list of light ids that are on in the room
  - sceneIds: A list of scene ids that are active in the room

# Rules
1. You must sort every single and light and every single scene into a room
2. You must sort the rooms into a logical order
3. You must sort the lights and scenes within each room into a logical order

`;

@Component({
  selector: 'app-dashboard',
  imports: [SceneCardButtonComponent, LightCardButtonComponent, MatIconModule],
  template: `
    @let result = layout.value();

    @if (result) {
      <div class="header">
        <h1>{{ result.greeting }}</h1>
        <div class="three-best-scenes">
          @for (scene of result.threeBestScenes; track $index) {
            <!-- <app-scene-card-button
              [sceneId]="scene.id"
              [shortenedName]="scene.name"
            ></app-scene-card-button> -->
          }
        </div>
      </div>

      @for (room of result.rooms; track $index) {
        <div class="room">
          <div class="room-header">
            <mat-icon>{{ room.roomIcon }}</mat-icon>
            <h2>{{ room.roomName }}</h2>
          </div>
          <div class="room-content">
            @for (scene of room.scenes; track $index) {
              <app-scene-card-button
                [sceneId]="scene.id"
                [shortenedName]="scene.name"
              ></app-scene-card-button>
            }
            @for (light of room.lights; track $index) {
              <app-light-card-button
                [lightId]="light.id"
                [icon]="light.icon"
                [shortenedName]="light.name"
              ></app-light-card-button>
            }
          </div>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-start;
      gap: 16px;
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 16px 0 24px;
    }

    .header {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }

    h1 {
      font-size: 40px;
      font-weight: 200;
      line-height: 56px;
      letter-spacing: 0%;
      text-align: left;
      color: rgba(0, 0, 0, 0.87);
    }

    .three-best-scenes {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
    }

    .room {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-start;
    }

    .room-header {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      padding: 8px 0;
    }

    .room-content {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      justify-content: flex-start;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class DashboardComponent {
  now = new Date().toLocaleString();
  store = inject(Store);
  lights = this.store.selectSignal(selectAllLights);
  scenes = this.store.selectSignal(selectAllScenes);
  lightIdsAndNames = computed(() =>
    this.lights()
      .map((light) => ({
        id: light.id,
        name: light.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  sceneIdsAndNames = computed(() =>
    this.scenes()
      .map((scene) => ({
        id: scene.id,
        name: scene.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  ambientState = computed(
    () => `
    The user is "Mike Ryan"
    The datetime in my house is ${this.now}
    The lights in my house are ${JSON.stringify(this.lightIdsAndNames())}
    The scenes in my house are ${JSON.stringify(this.sceneIdsAndNames())}
  `,
  );

  layout = structuredCompletionResource({
    model: 'gpt-4.1-nano',
    input: this.ambientState,
    system,
    schema: s.object('The layout of the dashboard', {
      greeting: s.streaming.string('A very short, time-based greeting'),
      threeBestScenes: s.streaming.array(
        'The three most important scenes',
        s.object('A scene', {
          id: s.string('UUID for a scene'),
          name: s.streaming.string('Your shortened name for the scene'),
        }),
      ),
      rooms: s.streaming.array(
        'The rooms in the house',
        s.object('A room', {
          roomIcon: RoomIconSchema,
          roomName: s.streaming.string('The name of the room'),
          scenes: s.streaming.array(
            'The scenes in the room',
            s.object('A scene', {
              id: s.string('UUID for a scene'),
              name: s.streaming.string('Your shortened name for the scene'),
            }),
          ),
          lights: s.streaming.array(
            'The lights in the room',
            s.object('A light', {
              id: s.string('UUID for a light'),
              icon: LightIconSchema,
              name: s.streaming.string('Your shortened name for the light'),
            }),
          ),
        }),
      ),
    }),
  });

  constructor() {
    this.store.dispatch(DashboardPageActions.enter());
  }
}
