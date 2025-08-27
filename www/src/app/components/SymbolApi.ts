import { NgClass } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  ApiExcerptToken,
  ApiExcerptTokenKind,
  ApiMember,
  ApiMemberKind,
} from '../models/api-report.models';
import { SymbolExcerpt } from './SymbolExcerpt';
import { SymbolExcerptGroup } from './SymbolExcerptGroup';

export const SymbolApiDensity = {
  0: '0',
  '-1': '-1',
};

@Component({
  selector: 'www-symbol-api',
  imports: [SymbolExcerpt, SymbolExcerptGroup, NgClass],
  template: `
    <h2>API</h2>
    <www-symbol-excerpt-group [ngClass]="'d' + density()">
      <www-symbol-excerpt
        [excerptTokens]="headerExcerptTokens()"
        [formattedContent]="headerFormattedContent()"
        [overlayTokens]="headerOverlayTokens()"
        class="header"
      />
      @for (member of bodyMembers(); track member.canonicalReference) {
        @switch (density()) {
          @case ('0') {
            <a
              [href]="currentUrlWithoutHash() + '#' + member.name"
              (click)="navigateToMethod($event, member.name)"
            >
              <www-symbol-excerpt
                [excerptTokens]="member.excerptTokens"
                [formattedContent]="member.formattedContent"
                [overlayTokens]="member.overlayTokens ?? null"
                [deprecated]="!!member.docs.deprecated"
                class="member"
              />
            </a>
          }
          @case ('-1') {
            <www-symbol-excerpt
              [excerptTokens]="member.excerptTokens"
              [formattedContent]="member.formattedContent"
              [overlayTokens]="member.overlayTokens ?? null"
              [deprecated]="!!member.docs.deprecated"
              class="member"
            />
          }
        }
      }
      @if (footerExcerptTokens().length) {
        <www-symbol-excerpt
          [excerptTokens]="footerExcerptTokens()"
          class="footer"
        />
      }
    </www-symbol-excerpt-group>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    www-symbol-excerpt-group {
      padding: 8px 0;

      > a {
        &:hover {
          background: #3d3c3a;
        }
      }

      &.d-1 {
        .header,
        .member,
        .footer {
          padding: 2px 8px;
        }
      }
    }

    .member {
      margin-left: 16px;
    }
  `,
})
export class SymbolApi {
  router = inject(Router);
  symbol = input.required<ApiMember>();
  density = input<string>(SymbolApiDensity[0]);

  headerOverlayTokens = computed((): ApiExcerptToken[] | null => {
    const symbol = this.symbol();
    return symbol.overlayTokens ?? null;
  });

  headerExcerptTokens = computed((): ApiExcerptToken[] => {
    const symbol = this.symbol();
    if (
      symbol.kind === ApiMemberKind.Class ||
      symbol.kind === ApiMemberKind.Interface ||
      symbol.kind === ApiMemberKind.Enum
    ) {
      return [
        ...symbol.excerptTokens,
        {
          kind: ApiExcerptTokenKind.Content,
          text: ' {',
        },
      ];
    }

    return symbol.excerptTokens;
  });
  headerFormattedContent = computed((): string => {
    const symbol = this.symbol();
    if (
      symbol.kind === ApiMemberKind.Class ||
      symbol.kind === ApiMemberKind.Interface ||
      symbol.kind === ApiMemberKind.Enum
    ) {
      return '';
    }
    return symbol.formattedContent;
  });
  bodyMembers = computed((): ApiMember[] => {
    const symbol = this.symbol();

    if (
      symbol.kind === ApiMemberKind.Class ||
      symbol.kind === ApiMemberKind.Interface ||
      symbol.kind === ApiMemberKind.Enum ||
      symbol.kind === ApiMemberKind.Namespace
    ) {
      const members = symbol.members ?? [];
      const [nonDeprecatedMembers, deprecatedMembers] = members.reduce(
        (acc, member) => {
          if (member.docs.deprecated) {
            acc[1].push(member);
          } else {
            acc[0].push(member);
          }

          return acc;
        },
        [[], []] as [ApiMember[], ApiMember[]],
      );

      return [...nonDeprecatedMembers, ...deprecatedMembers];
    }

    return [];
  });
  footerExcerptTokens = computed((): ApiExcerptToken[] => {
    const symbol = this.symbol();

    if (
      symbol.kind === ApiMemberKind.Class ||
      symbol.kind === ApiMemberKind.Interface ||
      symbol.kind === ApiMemberKind.Enum
    ) {
      return [
        {
          kind: ApiExcerptTokenKind.Content,
          text: '}',
        },
      ];
    }

    return [];
  });
  currentUrlWithoutHash = computed((): string => {
    const currentUrl = this.router.url;
    return currentUrl.split('#')[0];
  });

  navigateToMethod($event: MouseEvent, id: string) {
    $event.preventDefault();

    this.router.navigate([], { fragment: id }).then(() => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}
