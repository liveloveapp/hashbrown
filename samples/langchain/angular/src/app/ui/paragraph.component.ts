import { Component, input } from '@angular/core';
import { exposeComponent, MagicText } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

@Component({
  selector: 'app-paragraph',
  imports: [MagicText],
  template: `
    <div class="wrapper">
      <p class="paragraph" [attr.data-raw-text]="text()">
        <hb-magic-text [text]="text()" />
      </p>
    </div>
  `,
  styles: `
    .wrapper {
      display: block;
      margin-bottom: 12px;
    }

    .paragraph {
      line-height: 1.6;
    }
  `,
})
export class ParagraphComponent {
  readonly text = input.required<string>();
}

export const exposedParagraph = exposeComponent(ParagraphComponent, {
  name: 'p',
  description: 'Display a paragraph of text',
  input: {
    text: s.streaming.string('The paragraph text content'),
  },
});
