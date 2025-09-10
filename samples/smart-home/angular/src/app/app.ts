import { Component, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { Dashboard } from './dashboard/dashboard';
import { Suggestions } from './suggestions/suggestions';

@Component({
  imports: [Dashboard, Suggestions],
  selector: 'app-root',
  template: `
    <app-dashboard />
    <app-suggestions />
  `,
})
export class App {
  readonly iconRegistry = inject(MatIconRegistry);

  constructor() {
    this.iconRegistry.setDefaultFontSetClass('material-symbols-outlined');
  }
}
