import { Component, input } from '@angular/core';

@Component({
  selector: 'spot-song',
  template: `
    <div>
      <h1>{{ name() }}</h1>
      <p>{{ artist() }}</p>
    </div>
  `,
})
export class SongComponent {
  name = input.required<string>();
  artist = input.required<string>();
  uri = input.required<string>();
}
