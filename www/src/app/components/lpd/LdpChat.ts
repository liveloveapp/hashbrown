import { Component } from '@angular/core';
import { LpdWindow } from './LpdWindow';

@Component({
  selector: 'www-lpd-chat',
  imports: [LpdWindow],
  template: `
    <www-lpd-window title="AI Chat">
      <div class="chat">
        <h2>Chat</h2>
      </div>
    </www-lpd-window>
  `,
})
export class LdpChat {}
