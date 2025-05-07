import { Component, input } from '@angular/core';

@Component({
  selector: 'www-lpd-window',
  template: `
    <div class="lpd-window">
      <div class="lpd-window-header">
        <div class="lpd-window-controls">
          <span class="lpd-window-control"></span>
          <span class="lpd-window-control"></span>
          <span class="lpd-window-control"></span>
        </div>
        <div class="lpd-window-title">
          <h4>{{ title() }}</h4>
        </div>
      </div>
      <div class="lpd-window-content">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: `
    .lpd-window {
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      border: 1px solid rgba(61, 60, 58, 1);
      overflow: hidden;
    }

    .lpd-window-header {
      display: flex;
      align-items: center;
      height: 32px;
      border-bottom: 1px solid rgba(61, 60, 58, 1);
    }

    .lpd-window-controls {
      display: flex;
      align-items: center;
      gap: 4px;
      border-right: 1px solid rgba(61, 60, 58, 1);
      padding: 0 12px;
      height: 100%;
    }

    .lpd-window-control {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1px solid rgba(61, 60, 58, 1);
    }

    .lpd-window-title {
      color: #3d3c3a;
      font: 400 13px / normal Poppins;
      padding: 0 12px;
    }
  `,
})
export class LpdWindow {
  title = input.required<string>();
}
