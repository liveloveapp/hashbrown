import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';

@Component({
  imports: [RouterModule],
  selector: 'app-root',
  template: ` <router-outlet></router-outlet>`,
  styles: ``,
})
export class App {
  constructor(iconRegistry: MatIconRegistry) {
    iconRegistry.setDefaultFontSetClass('material-symbols-outlined');
  }
}
