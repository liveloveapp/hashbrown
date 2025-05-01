import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-card',
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>{{ title() }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <ng-content></ng-content>
      </mat-card-content>
    </mat-card>
  `,
  imports: [MatCardModule],
  styles: `
    :host {
      display: block;
      margin-bottom: 8px;
    }
  `,
})
export class CardComponent {
  title = input.required<string>();
}
