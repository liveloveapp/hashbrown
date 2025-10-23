import { Component, computed, input } from '@angular/core';
import {
  ApiExcerptToken,
  ApiExcerptTokenKind,
  ApiMember,
  ApiMemberKind,
} from '../models/api-report.models';
import { CodeExample } from './CodeExample';
import { DeprecatedChip } from './DeprecatedChip';
import { SymbolExcerpt } from './SymbolExcerpt';
import { SymbolParams } from './SymbolParams';
import { SymbolReturns } from './SymbolReturns';
import { SymbolSummary } from './SymbolSummary';
import { SymbolTypeParams } from './SymbolTypeParams';
import { SymbolUsageNotes } from './SymbolUsageNotes';

@Component({
  selector: 'www-symbol-methods',
  standalone: true,
  imports: [
    CodeExample,
    DeprecatedChip,
    SymbolExcerpt,
    SymbolParams,
    SymbolReturns,
    SymbolSummary,
    SymbolTypeParams,
    SymbolUsageNotes,
  ],
  template: `
    @for (method of methods(); track $index) {
      <www-code-example
        [header]="method.name"
        [copyable]="false"
        [id]="method.name"
      >
        <ng-container actions>
          <www-symbol-excerpt
            [excerptTokens]="trimExcerptTokens(method.excerptTokens)"
          />
          @if (method.docs.deprecated) {
            <www-deprecated-chip [reason]="method.docs.deprecated" />
          }
        </ng-container>
        <div class="symbol">
          <www-symbol-summary [symbol]="method" />
          @if (method.parameters?.length) {
            <www-symbol-params [symbol]="method" />
          }
          @if (method.typeParameters?.length) {
            <www-symbol-type-params [symbol]="method" />
          }
          @if (method.returnTypeTokenRange) {
            <www-symbol-returns [symbol]="method" />
          }
          @if (method.docs.usageNotes) {
            <www-symbol-usage-notes [symbol]="method" />
          }
        </div>
      </www-code-example>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .symbol {
      display: flex;
      flex-direction: column;
      gap: 16px;
      color: var(--vanilla-ivory, #faf9f0);

      > * + * {
        border-top: 1px solid var(--gray, #5e5c5a);
        padding-top: 16px;
      }
    }
  `,
})
export class SymbolMethods {
  symbol = input.required<ApiMember>();
  methods = computed(() => {
    const members = this.symbol().members ?? [];
    const methods = members.filter((member) =>
      [ApiMemberKind.Method, ApiMemberKind.PropertySignature].includes(
        member.kind,
      ),
    );
    const [nonDeprecatedMethods, deprecatedMethods] = methods.reduce(
      (acc, method) => {
        if (method.docs.deprecated) {
          acc[1].push(method);
        } else {
          acc[0].push(method);
        }

        return acc;
      },
      [[], []] as [ApiMember[], ApiMember[]],
    );

    return [...nonDeprecatedMethods, ...deprecatedMethods].map((member) => {
      const parameters = member.parameters ?? [];

      return {
        ...member,
        simpleParameters: parameters.map((param, index) => {
          return {
            name: param.parameterName,
            isLast: index === parameters.length - 1,
          };
        }),
      };
    });
  });

  getMethodSeparater(method: ApiMember) {
    return method.isStatic ? '.' : '#';
  }

  getMethodSignature(method: ApiMember) {
    const symbolName = this.symbol().name;
    const instanceName = method.isStatic
      ? symbolName
      : `${symbolName[0].toLowerCase()}${symbolName.slice(1)}`;
    const parameters = method.parameters ?? [];
    const simpleParameters = parameters.map((param) => param.parameterName);

    return `${instanceName}.${method.name}(${simpleParameters.join(', ')})`;
  }

  trimExcerptTokens(excerptTokens: ApiExcerptToken[]) {
    const tokens = excerptTokens.slice(1);
    if (
      tokens[tokens.length - 1].kind === ApiExcerptTokenKind.Content &&
      tokens[tokens.length - 1].text === ';'
    ) {
      tokens.pop();
    }
    return tokens;
  }
}
