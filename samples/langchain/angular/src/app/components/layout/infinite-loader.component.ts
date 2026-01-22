import { Component } from '@angular/core';
import { IconRadarComponent } from '../icons/icon-radar.component';

@Component({
  selector: 'app-infinite-loader',
  imports: [IconRadarComponent],
  template: `
    <div class="container">
      <app-icon-radar [size]="180" class="radar" />
    </div>
  `,
  styles: `
    .container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      min-height: 200px;
      padding: 32px;
    }

    .radar {
      display: block;
    }
  `,
})
export class InfiniteLoaderComponent {}
