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

@Component({
  selector: 'www-symbol-api',
  imports: [SymbolExcerpt, SymbolExcerptGroup],
  template: `
    <www-symbol-excerpt-group>
      <www-symbol-excerpt
        [excerptTokens]="headerExcerptTokens()"
        class="header"
      />
      @for (member of bodyMembers(); track $index) {
        <a
          [href]="currentUrlWithoutHash() + '#' + member.name"
          (click)="navigateToMethod($event, member.name)"
        >
          <www-symbol-excerpt
            [excerptTokens]="member.excerptTokens"
            [deprecated]="!!member.docs.deprecated"
            class="member"
          />
        </a>
      }
      @if (footerExcerptTokens().length) {
        <www-symbol-excerpt
          [excerptTokens]="footerExcerptTokens()"
          class="footer"
        />
      }
    </www-symbol-excerpt-group>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      www-symbol-excerpt-group {
        padding: 16px 0;
      }

      a {
        &:hover {
          background-color: rgba(255, 255, 255, 0.08);
        }
      }

      .header,
      .member,
      .footer {
        padding: 8px 16px;
      }

      .member {
        margin-left: 16px;
      }
    `,
  ],
})
export class SymbolApi {
  router = inject(Router);
  symbol = input.required<ApiMember>();
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
  bodyMembers = computed((): ApiMember[] => {
    const symbol = this.symbol();

    if (
      symbol.kind === ApiMemberKind.Class ||
      symbol.kind === ApiMemberKind.Interface ||
      symbol.kind === ApiMemberKind.Enum
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
