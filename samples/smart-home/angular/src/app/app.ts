import { Component, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { Dashboard } from './dashboard/dashboard';
import { Suggestions } from './suggestions/suggestions';
import { CursorOverlayComponent } from './cursor-overlay.component';
import { SampleGatewayService } from './sample-gateway.service';

@Component({
  imports: [Dashboard, Suggestions, CursorOverlayComponent],
  selector: 'app-root',
  template: `
    <app-dashboard />
    <app-suggestions />
    <app-cursor-overlay />
  `,
})
export class App {
  readonly iconRegistry = inject(MatIconRegistry);
  // Ensure gateway is instantiated
  readonly _gateway = inject(SampleGatewayService);

  constructor() {
    this.iconRegistry.setDefaultFontSetClass('material-symbols-outlined');
  }
}
