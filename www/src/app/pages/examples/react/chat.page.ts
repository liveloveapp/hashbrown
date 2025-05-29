import { Component } from '@angular/core';
import { Stackblitz } from '../../../components/Stackblitz';

@Component({
  template: `<www-stackblitz name="react/chat" />`,
  imports: [Stackblitz],
  styles: `
    :host {
      flex: 1 auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
  `,
})
export default class ChatPage {}
