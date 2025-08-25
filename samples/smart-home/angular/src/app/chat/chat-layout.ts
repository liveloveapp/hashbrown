import { Component } from '@angular/core';

@Component({
  selector: 'app-chat-layout',
  template: '<ng-content/>',
  styles: `
    :host {
      display: grid;
      flex-grow: 0;
      height: 100dvh;
      width: 100%;
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }
  `,
})
export class ChatLayout {}
