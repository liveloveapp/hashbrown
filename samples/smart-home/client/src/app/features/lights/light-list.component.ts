import { Component, input } from '@angular/core';
import { s } from '@hashbrownai/core';
import { MatIconModule } from '@angular/material/icon';

export const LightListIconSchema = s.enumType('Icon for a Group of Lights', [
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

@Component({
  selector: 'app-light-list',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="list-header">
      <div class="list-icon">
        <mat-icon>{{ icon() }}</mat-icon>
      </div>
      <h2 class="list-title">
        {{ title() }}
      </h2>
    </div>
    <div class="list-content">
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background-color: #fff;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
      }

      .list-header {
        display: grid;
        grid-template-columns: 32px 1fr;
        align-items: center;
        column-gap: 24px;
        padding: 16px 16px 8px;
      }

      .list-icon {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .list-content {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      :host ::ng-deep app-light:not(:last-child) {
        border-bottom: 1px solid #e0e0e0;
      }
    `,
  ],
})
export class LightListComponent {
  icon = input.required<s.Infer<typeof LightListIconSchema>>();
  title = input.required<string>();
}
