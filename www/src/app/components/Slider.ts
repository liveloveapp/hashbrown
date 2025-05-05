import { Component, input, output } from '@angular/core';

@Component({
  selector: 'www-slider',
  template: `
    <input
      type="range"
      min="0"
      max="100"
      [value]="value()"
      (input)="change.emit($event)"
    />
  `,
  styles: [
    `
      input {
        width: 120px;
        -webkit-appearance: none;
        appearance: none;
        height: 4px;
        background: rgba(47, 47, 43, 0.24);
        border-radius: 2px;
        outline: none;
      }

      input:focus {
        outline: none;
        box-shadow: 0 0 0 2px #2f2f2b33;
      }
    `,
  ],
})
export class Slider {
  change = output<Event>();
  value = input.required<number>();
}
