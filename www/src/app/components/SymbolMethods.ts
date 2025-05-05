import { NgClass } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { ApiMember, ApiMemberKind } from '../models/api-report.models';
import { CodeHighlight } from '../pipes/CodeHighlight';
import { DeprecatedChip } from './DeprecatedChip';
import { SymbolExcerpt } from './SymbolExcerpt';
import { SymbolParams } from './SymbolParams';
import { SymbolSummary } from './SymbolSummary';
import { SymbolTypeParams } from './SymbolTypeParams';
import { SymbolUsageNotes } from './SymbolUsageNotes';

@Component({
  selector: 'www-symbol-methods',
  standalone: true,
  imports: [
    CodeHighlight,
    DeprecatedChip,
    NgClass,
    SymbolExcerpt,
    SymbolParams,
    SymbolSummary,
    SymbolTypeParams,
    SymbolUsageNotes,
  ],
  template: `
    @for (method of methods(); track $index) {
      <div class="method" [id]="method.name">
        <div class="header">
          <h3 [ngClass]="{ deprecated: method.docs.deprecated }">
            <code
              [innerHTML]="getMethodSignature(method) | codeHighlight"
            ></code>
          </h3>
          <div>
            @if (method.docs.deprecated) {
              <www-deprecated-chip [reason]="method.docs.deprecated" />
            }
            @if (method.returnTypeTokenRange) {
              <www-symbol-excerpt
                [excerptTokens]="
                  method.excerptTokens.slice(
                    method.returnTypeTokenRange.startIndex,
                    method.returnTypeTokenRange.endIndex
                  )
                "
              />
            }
          </div>
        </div>
        @if (method.docs.summary) {
          <www-symbol-summary [symbol]="method" />
        }
        <www-symbol-params [symbol]="method" />
        <www-symbol-type-params [symbol]="method" />
        <www-symbol-usage-notes [symbol]="method" />
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .method {
        display: flex;
        flex-direction: column;
        border-radius: 12px;
        background-color: rgba(47, 47, 43, 0.04);

        > .header {
          padding: 16px;
          display: grid;
          align-items: center;
          grid-template-columns: 1fr max-content;
          grid-template-areas:
            'name deprecated'
            'summary summary';

          > div {
            background-color: rgba(166, 216, 210, 0.24);
            padding: 4px 8px;
            border-radius: 4px;
          }
        }
      }

      .summary {
        font-size: 16px;
        margin: 0;
        padding: 8px;
        grid-area: summary;
      }

      .methodSymbol {
        font-weight: 700;
      }

      .methodName {
        padding: 8px;
        display: flex;
        flex-direction: row;
        grid-area: name;
      }

      .methodName.deprecated {
        text-decoration: line-through;
        font-style: italic;
      }

      code {
        font-family: 'Oxanium', sans-serif;
        font-size: 18px;
      }

      www-deprecated-chip {
        grid-area: deprecated;
      }

      .returns {
        grid-area: returns;
      }

      .summary {
        grid-area: summary;
      }

      p {
        font-size: 13px;
        padding: 0;
        margin: 0;
      }
    `,
  ],
})
export class SymbolMethods {
  symbol = input.required<ApiMember>();
  methods = computed(() => {
    const members = this.symbol().members ?? [];
    const methods = members.filter(
      (member) => member.kind === ApiMemberKind.Method,
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
}
