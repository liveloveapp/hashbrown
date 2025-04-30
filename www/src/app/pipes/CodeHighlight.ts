import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { HighlighterService } from '../services/HighlighterService';

@Pipe({
  name: 'codeHighlight',
  pure: true,
})
export class CodeHighlight implements PipeTransform {
  domSanitizer = inject(DomSanitizer);
  highlighterService = inject(HighlighterService);

  transform(code: string) {
    return this.domSanitizer.bypassSecurityTrustHtml(
      this.highlighterService.getHighlighter().codeToHtml(code, {
        lang: 'typescript',
        theme: 'github-dark',
      }),
    );
  }
}
