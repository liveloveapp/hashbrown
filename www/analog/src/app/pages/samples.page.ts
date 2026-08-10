import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
  `,
})
export default class SamplesPage {}
