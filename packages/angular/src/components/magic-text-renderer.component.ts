/* eslint-disable @angular-eslint/component-class-suffix */
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  Directive,
  input,
  InputSignal,
  output,
  TemplateRef,
  ViewEncapsulation,
} from '@angular/core';
import {
  type MagicTextAstNode,
  type MagicTextNodeType,
  type MagicTextParserOptions,
  type TextSegment,
} from '@hashbrownai/core';
import { injectMagicTextParser } from '../utils/inject-magic-text-parser.fn';

type MagicTextLinkNode = Extract<MagicTextAstNode, { type: 'link' }>;
type MagicTextAutolinkNode = Extract<MagicTextAstNode, { type: 'autolink' }>;
type MagicTextCitationNode = Extract<MagicTextAstNode, { type: 'citation' }>;

const WORD_JOINER = '\u2060';

type MagicTextNodeTemplateType = MagicTextNodeType | 'node';

type CitationRenderData = {
  id: string;
  number: number | string;
  text?: string;
  url?: string;
};

/** @public */
export type MagicTextLinkClickEvent = {
  mouseEvent: MouseEvent;
  url: string;
  node: MagicTextLinkNode | MagicTextAutolinkNode;
};

/** @public */
export type MagicTextCitationClickEvent = {
  mouseEvent: MouseEvent;
  citation: CitationRenderData;
  node: MagicTextCitationNode;
};

/** @public */
export type MagicTextNodeRenderContext = {
  node: MagicTextAstNode;
  isOpen: boolean;
  isComplete: boolean;
  renderChildren: () => unknown;
};

/** @public */
export type MagicTextTextSegmentRenderContext = {
  node: Extract<MagicTextAstNode, { type: 'text' }>;
  segment: TextSegment;
  index: number;
};

/** @public */
export type MagicTextCaretContext = {
  node: MagicTextAstNode;
  depth: number;
};

/** @public */
export type MagicTextCitationRenderContext = {
  node: MagicTextCitationNode;
  citation: CitationRenderData;
  label: string;
  isOpen: boolean;
  isComplete: boolean;
};

type $Implicit<T> = { $implicit: T };

/** @public */
@Directive({ selector: 'ng-template[hbMagicTextRenderNode]' })
export class MagicTextRenderNode {
  nodeType = input.required<MagicTextNodeTemplateType>();

  constructor(readonly template: TemplateRef<MagicTextNodeRenderContext>) {}

  static ngTemplateContextGuard(
    dir: MagicTextRenderNode,
    context: unknown,
  ): context is $Implicit<MagicTextNodeRenderContext> {
    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbMagicTextRenderTextSegment]' })
export class MagicTextRenderTextSegment {
  constructor(
    readonly template: TemplateRef<MagicTextTextSegmentRenderContext>,
  ) {}

  static ngTemplateContextGuard(
    dir: MagicTextRenderTextSegment,
    context: unknown,
  ): context is $Implicit<MagicTextTextSegmentRenderContext> {
    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbMagicTextRenderCaret]' })
export class MagicTextRenderCaret {
  constructor(readonly template: TemplateRef<MagicTextCaretContext>) {}

  static ngTemplateContextGuard(
    dir: MagicTextRenderCaret,
    context: unknown,
  ): context is $Implicit<MagicTextCaretContext> {
    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbMagicTextRenderCitation]' })
export class MagicTextRenderCitation {
  constructor(readonly template: TemplateRef<MagicTextCitationRenderContext>) {}

  static ngTemplateContextGuard(
    dir: MagicTextRenderCitation,
    context: unknown,
  ): context is $Implicit<MagicTextCitationRenderContext> &
    MagicTextCitationRenderContext {
    return true;
  }
}

/** @public */
@Component({
  selector: 'hb-magic-text',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-template #nodeTemplateRef let-node="node">
      @if (node) {
        @if (getNodeTemplate(node.type); as customNodeTemplate) {
          <ng-container
            *ngTemplateOutlet="
              customNodeTemplate;
              context: getNodeTemplateOutletContext(node)
            "
          />
        } @else if (getNodeTemplate('node'); as fallbackNodeTemplate) {
          <ng-container
            *ngTemplateOutlet="
              fallbackNodeTemplate;
              context: getNodeTemplateOutletContext(node)
            "
          />
        } @else {
          @switch (node.type) {
            @case ('document') {
              @for (childId of getChildren(node); track childId) {
                <ng-container
                  *ngTemplateOutlet="
                    nodeTemplateRef;
                    context: { node: getNodeById(childId) }
                  "
                />
              }

              <ng-container
                *ngTemplateOutlet="
                  resolveCaretTemplate(defaultCaretTemplate);
                  context: getCaretContext(node)
                "
              />
            }

            @case ('paragraph') {
              <p
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                @for (childId of getChildren(node); track childId) {
                  <ng-container
                    *ngTemplateOutlet="
                      nodeTemplateRef;
                      context: { node: getNodeById(childId) }
                    "
                  />
                }

                <ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
                />
              </p>
            }

            @case ('heading') {
              @switch (node.level) {
                @case (1) {
                  <h1
                    [attr.data-magic-text-node]="node.type"
                    [attr.data-node-open]="isNodeOpen(node)"
                  >
                    @for (childId of getChildren(node); track childId) {
                      <ng-container
                        *ngTemplateOutlet="
                          nodeTemplateRef;
                          context: { node: getNodeById(childId) }
                        "
                      />
                    }

                    <ng-container
                      *ngTemplateOutlet="
                        resolveCaretTemplate(defaultCaretTemplate);
                        context: getCaretContext(node)
                      "
                    />
                  </h1>
                }
                @case (2) {
                  <h2
                    [attr.data-magic-text-node]="node.type"
                    [attr.data-node-open]="isNodeOpen(node)"
                  >
                    @for (childId of getChildren(node); track childId) {
                      <ng-container
                        *ngTemplateOutlet="
                          nodeTemplateRef;
                          context: { node: getNodeById(childId) }
                        "
                      />
                    }

                    <ng-container
                      *ngTemplateOutlet="
                        resolveCaretTemplate(defaultCaretTemplate);
                        context: getCaretContext(node)
                      "
                    />
                  </h2>
                }
                @case (3) {
                  <h3
                    [attr.data-magic-text-node]="node.type"
                    [attr.data-node-open]="isNodeOpen(node)"
                  >
                    @for (childId of getChildren(node); track childId) {
                      <ng-container
                        *ngTemplateOutlet="
                          nodeTemplateRef;
                          context: { node: getNodeById(childId) }
                        "
                      />
                    }

                    <ng-container
                      *ngTemplateOutlet="
                        resolveCaretTemplate(defaultCaretTemplate);
                        context: getCaretContext(node)
                      "
                    />
                  </h3>
                }
                @case (4) {
                  <h4
                    [attr.data-magic-text-node]="node.type"
                    [attr.data-node-open]="isNodeOpen(node)"
                  >
                    @for (childId of getChildren(node); track childId) {
                      <ng-container
                        *ngTemplateOutlet="
                          nodeTemplateRef;
                          context: { node: getNodeById(childId) }
                        "
                      />
                    }

                    <ng-container
                      *ngTemplateOutlet="
                        resolveCaretTemplate(defaultCaretTemplate);
                        context: getCaretContext(node)
                      "
                    />
                  </h4>
                }
                @case (5) {
                  <h5
                    [attr.data-magic-text-node]="node.type"
                    [attr.data-node-open]="isNodeOpen(node)"
                  >
                    @for (childId of getChildren(node); track childId) {
                      <ng-container
                        *ngTemplateOutlet="
                          nodeTemplateRef;
                          context: { node: getNodeById(childId) }
                        "
                      />
                    }

                    <ng-container
                      *ngTemplateOutlet="
                        resolveCaretTemplate(defaultCaretTemplate);
                        context: getCaretContext(node)
                      "
                    />
                  </h5>
                }
                @default {
                  <h6
                    [attr.data-magic-text-node]="node.type"
                    [attr.data-node-open]="isNodeOpen(node)"
                  >
                    @for (childId of getChildren(node); track childId) {
                      <ng-container
                        *ngTemplateOutlet="
                          nodeTemplateRef;
                          context: { node: getNodeById(childId) }
                        "
                      />
                    }

                    <ng-container
                      *ngTemplateOutlet="
                        resolveCaretTemplate(defaultCaretTemplate);
                        context: getCaretContext(node)
                      "
                    />
                  </h6>
                }
              }
            }

            @case ('blockquote') {
              <blockquote
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                @for (childId of getChildren(node); track childId) {
                  <ng-container
                    *ngTemplateOutlet="
                      nodeTemplateRef;
                      context: { node: getNodeById(childId) }
                    "
                  />
                }

                <ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
                />
              </blockquote>
            }

            @case ('list') {
              @if (node.ordered) {
                <ol
                  [attr.start]="node.start ?? null"
                  [attr.data-magic-text-node]="node.type"
                  [attr.data-node-open]="isNodeOpen(node)"
                  [attr.data-list-tight]="node.tight"
                >
                  @for (childId of getChildren(node); track childId) {
                    <ng-container
                      *ngTemplateOutlet="
                        nodeTemplateRef;
                        context: { node: getNodeById(childId) }
                      "
                    />
                  }

                  <ng-container
                    *ngTemplateOutlet="
                      resolveCaretTemplate(defaultCaretTemplate);
                      context: getCaretContext(node)
                    "
                  />
                </ol>
              } @else {
                <ul
                  [attr.data-magic-text-node]="node.type"
                  [attr.data-node-open]="isNodeOpen(node)"
                  [attr.data-list-tight]="node.tight"
                >
                  @for (childId of getChildren(node); track childId) {
                    <ng-container
                      *ngTemplateOutlet="
                        nodeTemplateRef;
                        context: { node: getNodeById(childId) }
                      "
                    />
                  }

                  <ng-container
                    *ngTemplateOutlet="
                      resolveCaretTemplate(defaultCaretTemplate);
                      context: getCaretContext(node)
                    "
                  />
                </ul>
              }
            }

            @case ('list-item') {
              <li
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                @for (childId of getChildren(node); track childId) {
                  <ng-container
                    *ngTemplateOutlet="
                      nodeTemplateRef;
                      context: { node: getNodeById(childId) }
                    "
                  />
                }

                <ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
                />
              </li>
            }

            @case ('table') {
              <table
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                <tbody>
                  @for (childId of getChildren(node); track childId) {
                    <ng-container
                      *ngTemplateOutlet="
                        nodeTemplateRef;
                        context: { node: getNodeById(childId) }
                      "
                    />
                  }

                  <ng-container
                    *ngTemplateOutlet="
                      resolveCaretTemplate(defaultCaretTemplate);
                      context: getCaretContext(node)
                    "
                  />
                </tbody>
              </table>
            }

            @case ('table-row') {
              <tr
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                @for (childId of getChildren(node); track childId) {
                  <ng-container
                    *ngTemplateOutlet="
                      nodeTemplateRef;
                      context: { node: getNodeById(childId) }
                    "
                  />
                }

                <ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
                />
              </tr>
            }

            @case ('table-cell') {
              @if (isTableHeaderCell(node)) {
                <th
                  [attr.data-magic-text-node]="node.type"
                  [attr.data-node-open]="isNodeOpen(node)"
                >
                  @for (childId of getChildren(node); track childId) {
                    <ng-container
                      *ngTemplateOutlet="
                        nodeTemplateRef;
                        context: { node: getNodeById(childId) }
                      "
                    />
                  }

                  <ng-container
                    *ngTemplateOutlet="
                      resolveCaretTemplate(defaultCaretTemplate);
                      context: getCaretContext(node)
                    "
                  />
                </th>
              } @else {
                <td
                  [attr.data-magic-text-node]="node.type"
                  [attr.data-node-open]="isNodeOpen(node)"
                >
                  @for (childId of getChildren(node); track childId) {
                    <ng-container
                      *ngTemplateOutlet="
                        nodeTemplateRef;
                        context: { node: getNodeById(childId) }
                      "
                    />
                  }

                  <ng-container
                    *ngTemplateOutlet="
                      resolveCaretTemplate(defaultCaretTemplate);
                      context: getCaretContext(node)
                    "
                  />
                </td>
              }
            }

            @case ('em') {
              <em
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                @for (childId of getChildren(node); track childId) {
                  <ng-container
                    *ngTemplateOutlet="
                      nodeTemplateRef;
                      context: { node: getNodeById(childId) }
                    "
                  />
                }

                <ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
                />
              </em>
            }

            @case ('strong') {
              <strong
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                @for (childId of getChildren(node); track childId) {
                  <ng-container
                    *ngTemplateOutlet="
                      nodeTemplateRef;
                      context: { node: getNodeById(childId) }
                    "
                  />
                }

                <ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
                />
              </strong>
            }

            @case ('strikethrough') {
              <s
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                @for (childId of getChildren(node); track childId) {
                  <ng-container
                    *ngTemplateOutlet="
                      nodeTemplateRef;
                      context: { node: getNodeById(childId) }
                    "
                  />
                }

                <ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
                />
              </s>
            }

            @case ('link') {
              <a
                [attr.href]="node.url"
                target="_blank"
                rel="noopener noreferrer"
                [attr.title]="node.title ?? null"
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
                (click)="handleLinkClick($event, node, node.url)"
              >
                @for (childId of getChildren(node); track childId) {
                  <ng-container
                    *ngTemplateOutlet="
                      nodeTemplateRef;
                      context: { node: getNodeById(childId) }
                    "
                  />
                }

                <ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
                />
              </a>
            }

            @case ('code-block') {
              <pre
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                <code [attr.data-code-info]="node.info ?? null">
                  {{ node.text }}
                  <ng-container
                    *ngTemplateOutlet="
                      resolveCaretTemplate(defaultCaretTemplate);
                      context: getCaretContext(node)
                    "
                  />
                </code>
              </pre>
            }

            @case ('thematic-break') {
              <hr
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              />
            }

            @case ('text') {
              @if (node.text.length && node.segments.length) {
                @for (
                  segment of node.segments;
                  track segment.start + ':' + segment.kind
                ) {
                  @if (textSegmentTemplate(); as textSegmentTpl) {
                    <ng-container
                      *ngTemplateOutlet="
                        textSegmentTpl;
                        context: {
                          node: node,
                          segment: segment,
                          index: $index,
                        }
                      "
                    />
                  } @else {
                    <span
                      class="hb-magic-text-segment"
                      [attr.data-magic-text-segment-kind]="segment.kind"
                      [attr.data-magic-text-whitespace]="segment.isWhitespace"
                      >{{ renderSegmentText(segment) }}</span
                    >
                  }
                }
              } @else if (node.text.length) {
                <span
                  class="hb-magic-text-segment"
                  data-magic-text-segment-kind="full"
                  data-magic-text-whitespace="false"
                  >{{ node.text }}</span
                >
              }
            }

            @case ('inline-code') {
              <code
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
                >{{ node.text }}</code
              >
            }

            @case ('soft-break') {
              {{
                '
'
              }}
            }

            @case ('hard-break') {
              <br
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              />
            }

            @case ('image') {
              <img
                [attr.src]="node.url"
                [attr.alt]="node.alt"
                [attr.title]="node.title ?? null"
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              />
            }

            @case ('autolink') {
              <a
                [attr.href]="node.url"
                target="_blank"
                rel="noopener noreferrer"
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
                (click)="handleLinkClick($event, node, node.url)"
                >{{ node.text }}</a
              >
            }

            @case ('citation') {
              @if (citationTemplate(); as citationTpl) {
                <ng-container
                  *ngTemplateOutlet="
                    citationTpl;
                    context: getCitationTemplateOutletContext(node)
                  "
                />
              } @else {
                @if (getCitation(node).url; as citationUrl) {
                  <sup
                    class="hb-magic-text-citation"
                    [attr.data-magic-text-node]="node.type"
                    [attr.data-node-open]="isNodeOpen(node)"
                  >
                    <a
                      class="hb-magic-text-citation-label"
                      [attr.href]="citationUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      role="doc-noteref"
                      (click)="handleCitationClick($event, node)"
                      >{{ getCitationLabel(node) }}</a
                    >
                  </sup>
                } @else {
                  <sup
                    class="hb-magic-text-citation"
                    [attr.data-magic-text-node]="node.type"
                    [attr.data-node-open]="isNodeOpen(node)"
                  >
                    <span
                      class="hb-magic-text-citation-label"
                      role="doc-noteref"
                      >{{ getCitationLabel(node) }}</span
                    >
                  </sup>
                }
              }
            }
          }
        }
      }
    </ng-template>

    <ng-template #defaultCaretTemplate let-node="node">
      @if (shouldRenderCaret(node.id)) {
        <span
          aria-hidden="true"
          class="hb-magic-text-caret"
          data-magic-text-caret
        ></span>
      }
    </ng-template>

    <div class="hb-magic-text-root" [class]="className()" data-magic-text-root>
      @if (rootNode(); as root) {
        <ng-container
          *ngTemplateOutlet="nodeTemplateRef; context: { node: root }"
        />
      }
    </div>
  `,
  styles: `
    .hb-magic-text-segment {
      opacity: 1;
      transition: opacity 400ms ease-out;
      @starting-style {
        opacity: 0;
      }
    }

    .hb-magic-text-citation {
      vertical-align: baseline;
    }

    .hb-magic-text-citation-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 1.4em;
      block-size: 1.4em;
      border-radius: 999px;
      border: 1px solid hsl(0 0% 50% / 0.35);
      background-color: hsl(0 0% 50% / 0.16);
      color: inherit;
      font-size: 0.7em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      text-decoration: none;
      transform: translateY(-0.15em);
    }

    .hb-magic-text-caret {
      display: inline-block;
      width: 0.48em;
      height: 0.48em;
      margin-inline-start: 0.08em;
      vertical-align: -0.08em;
      border-radius: 999px;
      background-color: currentColor;
      opacity: 0.55;
    }
  `,
})
export class MagicText {
  /**
   * Full markdown text, usually increasing over time.
   */
  readonly text: InputSignal<string> = input.required<string>();

  /**
   * Finalization flag for the current text.
   */
  readonly isComplete: InputSignal<boolean> = input(false);

  /**
   * Optional parser configuration overrides.
   */
  readonly options = input<Partial<MagicTextParserOptions> | undefined>(
    undefined,
  );

  /**
   * Caret visibility for streaming content.
   */
  readonly caret = input<boolean | TemplateRef<MagicTextCaretContext>>(true);

  /**
   * Optional root CSS class.
   */
  readonly className = input<string | undefined>(undefined);

  /**
   * Emitted when links or autolinks are clicked.
   */
  readonly linkClick = output<MagicTextLinkClickEvent>();

  /**
   * Emitted when citation anchors are clicked.
   */
  readonly citationClick = output<MagicTextCitationClickEvent>();

  readonly nodeTemplates = contentChildren(MagicTextRenderNode);
  readonly textSegmentTemplateDirective = contentChild(
    MagicTextRenderTextSegment,
  );
  readonly citationTemplateDirective = contentChild(MagicTextRenderCitation);
  readonly caretTemplateDirective = contentChild(MagicTextRenderCaret);

  private readonly parser = injectMagicTextParser(
    computed(() => this.text() ?? ''),
    computed(() => this.isComplete()),
    computed(() => this.options()),
  );

  protected readonly parserState = this.parser.parserState;
  protected readonly nodeById = this.parser.nodeById;
  protected readonly rootNode = this.parser.rootNode;

  protected readonly openNodeId = computed(() => {
    const stack = this.parserState().stack;
    const nodeById = this.nodeById();
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const candidate = nodeById.get(stack[index]);
      if (candidate && candidate.type !== 'document') {
        return candidate.id;
      }
    }

    return null;
  });

  protected readonly openNodeDepthById = computed(() => {
    const stack = this.parserState().stack;
    const map = new Map<number, number>();

    for (let index = 0; index < stack.length; index += 1) {
      map.set(stack[index], index);
    }

    return map;
  });

  protected readonly nodeTemplateMap = computed(() => {
    const map = new Map<
      MagicTextNodeTemplateType,
      TemplateRef<MagicTextNodeRenderContext>
    >();

    for (const nodeTemplate of this.nodeTemplates()) {
      map.set(nodeTemplate.nodeType(), nodeTemplate.template);
    }

    return map;
  });

  protected readonly textSegmentTemplate = computed(
    () => this.textSegmentTemplateDirective()?.template,
  );
  protected readonly citationTemplate = computed(
    () => this.citationTemplateDirective()?.template,
  );

  protected readonly caretTemplateFromContent = computed(
    () => this.caretTemplateDirective()?.template,
  );

  protected getNodeTemplate(type: MagicTextNodeTemplateType) {
    return this.nodeTemplateMap().get(type);
  }

  protected getNodeById(nodeId: number): MagicTextAstNode | null {
    return this.nodeById().get(nodeId) ?? null;
  }

  protected getChildren(node: MagicTextAstNode): readonly number[] {
    return 'children' in node ? node.children : [];
  }

  protected isNodeOpen(node: MagicTextAstNode): boolean {
    return !node.closed;
  }

  protected getNodeRenderContext(
    node: MagicTextAstNode,
  ): MagicTextNodeRenderContext {
    return {
      node,
      isOpen: !node.closed,
      isComplete: this.parserState().isComplete,
      renderChildren: () =>
        this.getChildren(node)
          .map((childId) => this.getNodeById(childId))
          .filter((child): child is MagicTextAstNode => child !== null),
    };
  }

  protected getNodeTemplateOutletContext(node: MagicTextAstNode): {
    $implicit: MagicTextNodeRenderContext;
    node: MagicTextAstNode;
    isOpen: boolean;
    isComplete: boolean;
    renderChildren: () => unknown;
  } {
    const context = this.getNodeRenderContext(node);

    return {
      $implicit: context,
      ...context,
    };
  }

  protected isTableHeaderCell(
    node: Extract<MagicTextAstNode, { type: 'table-cell' }>,
  ): boolean {
    if (node.parentId == null) {
      return false;
    }

    const parent = this.getNodeById(node.parentId);
    return parent?.type === 'table-row' && parent.isHeader;
  }

  protected shouldRenderCaret(nodeId: number): boolean {
    if (this.parserState().isComplete) {
      return false;
    }

    const caret = this.caret();
    if (caret === false) {
      return false;
    }

    return this.openNodeId() === nodeId;
  }

  protected getCaretContext(node: MagicTextAstNode): MagicTextCaretContext {
    return {
      node,
      depth: this.openNodeDepthById().get(node.id) ?? -1,
    };
  }

  protected resolveCaretTemplate(
    defaultTemplate: TemplateRef<MagicTextCaretContext>,
  ): TemplateRef<MagicTextCaretContext> {
    const caret = this.caret();
    if (caret instanceof TemplateRef) {
      return caret;
    }

    return this.caretTemplateFromContent() ?? defaultTemplate;
  }

  protected handleLinkClick(
    mouseEvent: MouseEvent,
    node: MagicTextLinkNode | MagicTextAutolinkNode,
    url: string,
  ): void {
    this.linkClick.emit({ mouseEvent, url, node });
  }

  protected getCitation(node: MagicTextCitationNode): CitationRenderData {
    const citations = this.parserState().citations;
    const number = node.number ?? citations.numbers[node.idRef] ?? node.idRef;
    const definition = citations.definitions[node.idRef];

    return {
      id: node.idRef,
      number,
      text: definition?.text,
      url: definition?.url,
    };
  }

  protected getCitationLabel(node: MagicTextCitationNode): string {
    return String(this.getCitation(node).number);
  }

  protected getCitationRenderContext(
    node: MagicTextCitationNode,
  ): MagicTextCitationRenderContext {
    return {
      node,
      citation: this.getCitation(node),
      label: this.getCitationLabel(node),
      isOpen: !node.closed,
      isComplete: this.parserState().isComplete,
    };
  }

  protected getCitationTemplateOutletContext(node: MagicTextCitationNode): {
    $implicit: MagicTextCitationRenderContext;
    node: MagicTextCitationNode;
    citation: CitationRenderData;
    label: string;
    isOpen: boolean;
    isComplete: boolean;
  } {
    const context = this.getCitationRenderContext(node);

    return {
      $implicit: context,
      ...context,
    };
  }

  protected handleCitationClick(
    mouseEvent: MouseEvent,
    node: MagicTextCitationNode,
  ): void {
    this.citationClick.emit({
      mouseEvent,
      citation: this.getCitation(node),
      node,
    });
  }

  protected renderSegmentText(segment: TextSegment): string {
    return segment.noBreakBefore
      ? `${WORD_JOINER}${segment.text}`
      : segment.text;
  }
}
