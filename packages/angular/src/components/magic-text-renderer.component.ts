import { NgClass, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  Directive,
  inject,
  input,
  InputSignal,
  output,
  TemplateRef,
  ViewEncapsulation,
} from '@angular/core';
import {
  type SegmenterOptions,
  type TextSegment,
  ɵcreateTextSegments,
  ɵsanitizeUrl,
} from '@hashbrownai/core';
import {
  type CitationDefinition,
  type MarkdownAutolinkNode,
  type MarkdownCitationReferenceNode,
  type MarkdownLinkNode,
  type MarkdownLinkReferenceNode,
  type MarkdownMathDisplayNode,
  type MarkdownMathInlineNode,
  type MarkdownNode,
  type MarkdownNodeType,
  type MarkdownTableCellNode,
  type MarkdownTextNode,
  type PartialMarkdownParserOptions,
} from '@cacheplane/partial-markdown';
import { injectMagicTextParser } from '../utils/inject-magic-text-parser.fn';

type MagicTextLinkNode =
  MarkdownLinkNode | MarkdownAutolinkNode | MarkdownLinkReferenceNode;
type MagicTextCitationNode = MarkdownCitationReferenceNode;

const WORD_JOINER = '\u2060';

type MagicTextNodeTemplateType = MarkdownNodeType | 'node';

/** Metadata available when a citation node is rendered. @public */
export type MagicTextCitationRenderData = {
  id: string;
  number: number | string;
  text?: string;
  definition?: CitationDefinition;
  url?: string;
};

/** @public */
export type MagicTextLinkClickEvent = {
  mouseEvent: MouseEvent;
  url: string;
  node: MagicTextLinkNode;
};

/** @public */
export type MagicTextCitationClickEvent = {
  mouseEvent: MouseEvent;
  citation: MagicTextCitationRenderData;
  node: MagicTextCitationNode;
};

/** @public */
export type MagicTextNodeRenderContext = {
  node: MarkdownNode;
  isOpen: boolean;
  isComplete: boolean;
  renderChildren: () => unknown;
};

/** @public */
export type MagicTextTextSegmentRenderContext = {
  node: MarkdownTextNode;
  segment: TextSegment;
  index: number;
};

/** @public */
export type MagicTextCaretContext = {
  node: MarkdownNode;
  depth: number;
};

/** @public */
export type MagicTextCitationRenderContext = {
  node: MagicTextCitationNode;
  citation: MagicTextCitationRenderData;
  label: string;
  isOpen: boolean;
  isComplete: boolean;
};

type $Implicit<T> = { $implicit: T };

/** @public */
@Directive({ selector: 'ng-template[hbMagicTextRenderNode]' })
export class MagicTextRenderNode {
  nodeType = input.required<MagicTextNodeTemplateType>();

  readonly template =
    inject<TemplateRef<MagicTextNodeRenderContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: MagicTextRenderNode,
    _context: unknown,
  ): _context is $Implicit<MagicTextNodeRenderContext> {
    void _context;

    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbMagicTextRenderTextSegment]' })
export class MagicTextRenderTextSegment {
  readonly template =
    inject<TemplateRef<MagicTextTextSegmentRenderContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: MagicTextRenderTextSegment,
    _context: unknown,
  ): _context is $Implicit<MagicTextTextSegmentRenderContext> {
    void _context;

    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbMagicTextRenderCaret]' })
export class MagicTextRenderCaret {
  readonly template = inject<TemplateRef<MagicTextCaretContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: MagicTextRenderCaret,
    _context: unknown,
  ): _context is $Implicit<MagicTextCaretContext> {
    void _context;

    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbMagicTextRenderCitation]' })
export class MagicTextRenderCitation {
  readonly template =
    inject<TemplateRef<MagicTextCitationRenderContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: MagicTextRenderCitation,
    _context: unknown,
  ): _context is $Implicit<MagicTextCitationRenderContext> &
    MagicTextCitationRenderContext {
    void _context;

    return true;
  }
}

/** @public */
@Component({
  selector: 'hb-magic-text',
  imports: [NgClass, NgTemplateOutlet],
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
                @if (node.task) {
                  <input
                    type="checkbox"
                    [checked]="node.task.checked"
                    disabled
                    readonly
                  />
                }
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
                  [style.text-align]="node.alignment"
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
                  [style.text-align]="node.alignment"
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

            @case ('emphasis') {
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
                [attr.href]="getSafeUrl(node.url)"
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

            @case ('link-reference') {
              @if (node.resolved) {
                <a
                  [attr.href]="getSafeUrl(node.url)"
                  target="_blank"
                  rel="noopener noreferrer"
                  [attr.title]="node.title || null"
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
                </a>
              } @else {
                <span
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
                </span>
              }
            }

            @case ('code-block') {
              <pre
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                <code [attr.data-code-info]="node.language || null">
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

            @case ('math-display') {
              <div
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              >
                <span [textContent]="renderDisplayMath(node)"></span>
                <ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
                />
              </div>
            }

            @case ('html-block') {
              <!-- prettier-ignore -->
              <pre [attr.data-magic-text-node]="node.type" [attr.data-node-open]="isNodeOpen(node)"><span [textContent]="node.raw"></span><ng-container *ngTemplateOutlet="resolveCaretTemplate(defaultCaretTemplate); context: getCaretContext(node)" /></pre>
            }

            @case ('thematic-break') {
              <hr
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              />
            }

            @case ('text') {
              @if (getTextSegments(node); as segments) {
                @if (segments.length) {
                  @for (
                    segment of segments;
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
                        >{{ renderSegmentText(node, segment, $index) }}</span
                      >
                    }
                  }
                } @else if (node.text.length) {
                  <span
                    class="hb-magic-text-segment"
                    data-magic-text-segment-kind="full"
                    data-magic-text-whitespace="false"
                    >{{ renderFullText(node) }}</span
                  >
                }
              }

              <ng-container
                *ngTemplateOutlet="
                  resolveCaretTemplate(defaultCaretTemplate);
                  context: getCaretContext(node)
                "
              />
            }

            @case ('inline-code') {
              <code
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
                >{{ node.text
                }}<ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
              /></code>
            }

            @case ('math-inline') {
              <span
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
                >{{ renderInlineMath(node)
                }}<ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
              /></span>
            }

            @case ('html-inline') {
              <span
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
                >{{ node.raw
                }}<ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
              /></span>
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
                [attr.src]="getSafeUrl(node.url)"
                [attr.alt]="node.alt"
                [attr.title]="node.title ?? null"
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              />
            }

            @case ('autolink') {
              <a
                [attr.href]="getSafeUrl(node.url)"
                target="_blank"
                rel="noopener noreferrer"
                [attr.data-magic-text-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
                (click)="handleLinkClick($event, node, node.url)"
                >{{ node.text
                }}<ng-container
                  *ngTemplateOutlet="
                    resolveCaretTemplate(defaultCaretTemplate);
                    context: getCaretContext(node)
                  "
              /></a>
            }

            @case ('citation-reference') {
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

    <div
      class="hb-magic-text-root"
      [ngClass]="className()"
      data-magic-text-root
    >
      @if (rootNode(); as root) {
        <ng-container
          *ngTemplateOutlet="nodeTemplateRef; context: { node: root }"
        />
      }
    </div>
  `,
  styles: `
    .hb-magic-text-segment {
      animation: hb-magic-text-segment-enter 400ms ease-out;
    }

    @keyframes hb-magic-text-segment-enter {
      from {
        opacity: 0;
      }

      to {
        opacity: 1;
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
class MagicTextComponent {
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
  readonly parserOptions = input<PartialMarkdownParserOptions | undefined>();

  /**
   * Optional text segmentation used for streaming animations.
   */
  readonly segmenter = input<SegmenterOptions>(true);

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
    computed(() => this.parserOptions()),
  );

  protected readonly nodeById = this.parser.nodeById;
  protected readonly rootNode = this.parser.rootNode;

  protected readonly openNodeId = computed(
    () => this.parser.openNode()?.id ?? null,
  );

  protected readonly openNodeDepthById = computed(() => {
    const map = new Map<number, number>();
    let node = this.parser.openNode();
    const path: MarkdownNode[] = [];
    while (node && node.type !== 'document') {
      path.unshift(node);
      node = node.parent;
    }
    for (let index = 0; index < path.length; index += 1) {
      map.set(path[index].id, index);
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

  protected getNodeById(nodeId: number): MarkdownNode | null {
    return this.nodeById().get(nodeId) ?? null;
  }

  protected getChildren(node: MarkdownNode): readonly number[] {
    return 'children' in node ? node.children.map((child) => child.id) : [];
  }

  protected isNodeOpen(node: MarkdownNode): boolean {
    return node.status !== 'complete';
  }

  protected getNodeRenderContext(
    node: MarkdownNode,
  ): MagicTextNodeRenderContext {
    return {
      node,
      isOpen: node.status !== 'complete',
      isComplete: this.parser.isComplete(),
      renderChildren: () => ('children' in node ? node.children : []),
    };
  }

  protected getNodeTemplateOutletContext(node: MarkdownNode): {
    $implicit: MagicTextNodeRenderContext;
    node: MarkdownNode;
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

  protected isTableHeaderCell(node: MarkdownTableCellNode): boolean {
    return node.parent?.type === 'table-row' && node.parent.isHeader;
  }

  protected shouldRenderCaret(nodeId: number): boolean {
    if (this.parser.isComplete()) {
      return false;
    }

    const caret = this.caret();
    if (caret === false) {
      return false;
    }

    return this.openNodeId() === nodeId;
  }

  protected getCaretContext(node: MarkdownNode): MagicTextCaretContext {
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
    node: MagicTextLinkNode,
    url: string,
  ): void {
    this.linkClick.emit({ mouseEvent, url, node });
  }

  protected getCitation(
    node: MagicTextCitationNode,
  ): MagicTextCitationRenderData {
    const definition = this.rootNode()?.citations.get(node.refId);

    return {
      id: node.refId,
      number: node.index,
      definition,
      text: definition ? getNodeText(definition.children) : undefined,
      url: this.getSafeUrl(
        definition?.children.find(
          (child) => child.type === 'link' || child.type === 'autolink',
        )?.url,
      ),
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
      isOpen: node.status !== 'complete',
      isComplete: this.parser.isComplete(),
    };
  }

  protected getCitationTemplateOutletContext(node: MagicTextCitationNode): {
    $implicit: MagicTextCitationRenderContext;
    node: MagicTextCitationNode;
    citation: MagicTextCitationRenderData;
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

  protected getTextSegments(node: MarkdownTextNode): TextSegment[] {
    return ɵcreateTextSegments(node.text, 0, {
      segmenter: this.segmenter(),
      hasWarnedSegmenterUnavailable: false,
    }).segments;
  }

  protected getSafeUrl(url: string | undefined): string | undefined {
    return url ? ɵsanitizeUrl(url) : undefined;
  }

  protected renderSegmentText(
    node: MarkdownTextNode,
    segment: TextSegment,
    index: number,
  ): string {
    return index === 0 && this.shouldPreventBreakBefore(node)
      ? `${WORD_JOINER}${segment.text}`
      : segment.text;
  }

  protected renderFullText(node: MarkdownTextNode): string {
    return this.shouldPreventBreakBefore(node)
      ? `${WORD_JOINER}${node.text}`
      : node.text;
  }

  protected renderDisplayMath(node: MarkdownMathDisplayNode): string {
    const [opener, closer] =
      node.delimiter === '$$' ? ['$$', '$$'] : ['\\[', '\\]'];
    return `${opener}${node.text}${closer}`;
  }

  protected renderInlineMath(node: MarkdownMathInlineNode): string {
    const [opener, closer] =
      node.delimiter === '$' ? ['$', '$'] : ['\\(', '\\)'];
    return `${opener}${node.text}${closer}`;
  }

  private shouldPreventBreakBefore(node: MarkdownTextNode): boolean {
    const siblings =
      node.parent && 'children' in node.parent ? node.parent.children : [];
    const index = node.index;
    return (
      index !== null &&
      index > 0 &&
      siblings[index - 1]?.type === 'citation-reference'
    );
  }
}

function getNodeText(nodes: readonly MarkdownNode[]): string {
  return nodes
    .map((node) => {
      if ('text' in node && typeof node.text === 'string') {
        return node.text;
      }
      return 'children' in node ? getNodeText(node.children) : '';
    })
    .join('');
}

export { MagicTextComponent as MagicText };
