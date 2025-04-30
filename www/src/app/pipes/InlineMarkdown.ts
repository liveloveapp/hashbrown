import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Marked } from 'marked';

@Pipe({
  name: 'inlineMarkdown',
  pure: true,
})
export class InlineMarkdown implements PipeTransform {
  marked = new Marked();
  domSanitizer = inject(DomSanitizer);

  transform(value: string): SafeHtml {
    return this.domSanitizer.bypassSecurityTrustHtml(
      this.marked.parseInline(value) as string,
    );
  }
}
