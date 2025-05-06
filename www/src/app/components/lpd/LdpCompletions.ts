import { Component } from '@angular/core';
import { LpdWindow } from './LpdWindow';

@Component({
  selector: 'www-lpd-completions',
  imports: [LpdWindow],
  template: `
    <www-lpd-window title="Manage Lights">
      <div class="completions">
        <h2>Completions</h2>
      </div>
    </www-lpd-window>
  `,
  styles: `
    .completions {
      background-color: #f0f0f0;
    }
  `,
})
export class LdpCompletions {}
