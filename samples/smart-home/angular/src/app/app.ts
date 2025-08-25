import { Component, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { Dashboard } from './dashboard/dashboard';

@Component({
  imports: [Dashboard],
  selector: 'app-root',
  template: ` <app-dashboard /> `,
})
export class App {
  readonly iconRegistry = inject(MatIconRegistry);

  constructor() {
    this.iconRegistry.setDefaultFontSetClass('material-symbols-outlined');
  }
}
