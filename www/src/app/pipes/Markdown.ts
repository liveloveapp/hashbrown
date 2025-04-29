import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import {
  CanonicalReference,
  ParsedCanonicalReference,
} from '../models/api-report.models';
import { HighlighterService } from '../services/HighlighterService';

export const CanonicalReferenceExtension = {
  name: 'canonicalReference',
  level: 'inline',
  tokenizer(src: string): any {
    const rule = /@?[\w\/]+![\w]+:[\w]+/;
    const match = rule.exec(src);
    if (match) {
      const parsed = new ParsedCanonicalReference(
        match[0] as CanonicalReference,
      );
      const [before, after] = src.split(match[0]);
      return {
        type: 'canonicalReference',
        raw: src,
        name: parsed.name,
        canonicalReference: parsed.referenceString,
        before,
        after,
        tokens: [],
      };
    }
  },
  renderer(this: any, token: any) {
    return `${token.before}<www-markdown-symbol-link reference="${token.canonicalReference}" />${token.after}`;
  },
  childTokens: [],
};

@Pipe({
  name: 'markdown',
  pure: true,
})
export class Markdown implements PipeTransform {
  highlighterService = inject(HighlighterService);

  marked = new Marked(
    markedHighlight({
      langPrefix: 'language-',
      highlight: (code, lang, info) => {
        return this.highlighterService.getHighlighter().codeToHtml(code, {
          lang: 'typescript',
          theme: 'github-dark',
        });
      },
    }),
  );
  domSanitizer = inject(DomSanitizer);

  transform(value: string): SafeHtml {
    this.marked.use({ extensions: [CanonicalReferenceExtension] });
    return this.domSanitizer.bypassSecurityTrustHtml(
      this.marked.parse(value) as string,
    );
  }
}
