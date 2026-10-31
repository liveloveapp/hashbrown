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
import { injectProseParser } from '../utils/inject-prose-parser.fn';

type ProseLinkNode =
  MarkdownLinkNode | MarkdownAutolinkNode | MarkdownLinkReferenceNode;
type ProseCitationNode = MarkdownCitationReferenceNode;

const WORD_JOINER = '\u2060';

type ProseNodeTemplateType = MarkdownNodeType | 'node';

/** Metadata available when a citation node is rendered. @public */
export type ProseCitationRenderData = {
  id: string;
  number: number | string;
  text?: string;
  definition?: CitationDefinition;
  url?: string;
};

/** @public */
export type ProseLinkClickEvent = {
  mouseEvent: MouseEvent;
  url: string;
  node: ProseLinkNode;
};

/** @public */
export type ProseCitationClickEvent = {
  mouseEvent: MouseEvent;
  citation: ProseCitationRenderData;
  node: ProseCitationNode;
};

/** @public */
export type ProseNodeRenderContext = {
  node: MarkdownNode;
  isOpen: boolean;
  isComplete: boolean;
  renderChildren: () => unknown;
};

/** @public */
export type ProseTextSegmentRenderContext = {
  node: MarkdownTextNode;
  segment: TextSegment;
  index: number;
};

/** @public */
export type ProseCaretContext = {
  node: MarkdownNode;
  depth: number;
};

/** @public */
export type ProseCitationRenderContext = {
  node: ProseCitationNode;
  citation: ProseCitationRenderData;
  label: string;
  isOpen: boolean;
  isComplete: boolean;
};

type $Implicit<T> = { $implicit: T };

/** @public */
@Directive({ selector: 'ng-template[hbProseRenderNode]' })
export class ProseRenderNode {
  nodeType = input.required<ProseNodeTemplateType>();

  readonly template =
    inject<TemplateRef<ProseNodeRenderContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: ProseRenderNode,
    _context: unknown,
  ): _context is $Implicit<ProseNodeRenderContext> {
    void _context;

    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbProseRenderTextSegment]' })
export class ProseRenderTextSegment {
  readonly template =
    inject<TemplateRef<ProseTextSegmentRenderContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: ProseRenderTextSegment,
    _context: unknown,
  ): _context is $Implicit<ProseTextSegmentRenderContext> {
    void _context;

    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbProseRenderCaret]' })
export class ProseRenderCaret {
  readonly template = inject<TemplateRef<ProseCaretContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: ProseRenderCaret,
    _context: unknown,
  ): _context is $Implicit<ProseCaretContext> {
    void _context;

    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbProseRenderCitation]' })
export class ProseRenderCitation {
  readonly template =
    inject<TemplateRef<ProseCitationRenderContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: ProseRenderCitation,
    _context: unknown,
  ): _context is $Implicit<ProseCitationRenderContext> &
    ProseCitationRenderContext {
    void _context;

    return true;
  }
}

/** @public */
@Component({
  selector: 'hb-prose',
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
                [attr.data-prose-node]="node.type"
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
                    [attr.data-prose-node]="node.type"
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
                    [attr.data-prose-node]="node.type"
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
                    [attr.data-prose-node]="node.type"
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
                    [attr.data-prose-node]="node.type"
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
                    [attr.data-prose-node]="node.type"
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
                    [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                  [attr.data-prose-node]="node.type"
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
                  [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                  [attr.data-prose-node]="node.type"
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
                  [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                  [attr.data-prose-node]="node.type"
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
                  [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
              <pre [attr.data-prose-node]="node.type" [attr.data-node-open]="isNodeOpen(node)"><span [textContent]="node.raw"></span><ng-container *ngTemplateOutlet="resolveCaretTemplate(defaultCaretTemplate); context: getCaretContext(node)" /></pre>
            }

            @case ('thematic-break') {
              <hr
                [attr.data-prose-node]="node.type"
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
                        class="hb-prose-segment"
                        [attr.data-prose-segment-kind]="segment.kind"
                        [attr.data-prose-whitespace]="segment.isWhitespace"
                        >{{ renderSegmentText(node, segment, $index) }}</span
                      >
                    }
                  }
                } @else if (node.text.length) {
                  <span
                    class="hb-prose-segment"
                    data-prose-segment-kind="full"
                    data-prose-whitespace="false"
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
                [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
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
                [attr.data-prose-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              />
            }

            @case ('image') {
              <img
                [attr.src]="getSafeUrl(node.url)"
                [attr.alt]="node.alt"
                [attr.title]="node.title ?? null"
                [attr.data-prose-node]="node.type"
                [attr.data-node-open]="isNodeOpen(node)"
              />
            }

            @case ('autolink') {
              <a
                [attr.href]="getSafeUrl(node.url)"
                target="_blank"
                rel="noopener noreferrer"
                [attr.data-prose-node]="node.type"
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
                    class="hb-prose-citation"
                    [attr.data-prose-node]="node.type"
                    [attr.data-node-open]="isNodeOpen(node)"
                  >
                    <a
                      class="hb-prose-citation-label"
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
                    class="hb-prose-citation"
                    [attr.data-prose-node]="node.type"
                    [attr.data-node-open]="isNodeOpen(node)"
                  >
                    <span
                      class="hb-prose-citation-label"
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
          class="hb-prose-caret"
          data-prose-caret
        ></span>
      }
    </ng-template>

    <div
      class="hb-prose-root"
      [ngClass]="className()"
      data-prose-root
    >
      @if (rootNode(); as root) {
        <ng-container
          *ngTemplateOutlet="nodeTemplateRef; context: { node: root }"
        />
      }
    </div>
  `,
  styles: `
    .hb-prose-segment {
      animation: hb-prose-segment-enter 400ms ease-out;
    }

    @keyframes hb-prose-segment-enter {
      from {
        opacity: 0;
      }

      to {
        opacity: 1;
      }
    }

    .hb-prose-citation {
      vertical-align: baseline;
    }

    .hb-prose-citation-label {
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

    .hb-prose-caret {
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
class ProseComponent {
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
  readonly caret = input<boolean | TemplateRef<ProseCaretContext>>(true);

  /**
   * Optional root CSS class.
   */
  readonly className = input<string | undefined>(undefined);

  /**
   * Emitted when links or autolinks are clicked.
   */
  readonly linkClick = output<ProseLinkClickEvent>();

  /**
   * Emitted when citation anchors are clicked.
   */
  readonly citationClick = output<ProseCitationClickEvent>();

  readonly nodeTemplates = contentChildren(ProseRenderNode);
  readonly textSegmentTemplateDirective = contentChild(
    ProseRenderTextSegment,
  );
  readonly citationTemplateDirective = contentChild(ProseRenderCitation);
  readonly caretTemplateDirective = contentChild(ProseRenderCaret);

  private readonly parser = injectProseParser(
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
      ProseNodeTemplateType,
      TemplateRef<ProseNodeRenderContext>
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

  protected getNodeTemplate(type: ProseNodeTemplateType) {
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
  ): ProseNodeRenderContext {
    return {
      node,
      isOpen: node.status !== 'complete',
      isComplete: this.parser.isComplete(),
      renderChildren: () => ('children' in node ? node.children : []),
    };
  }

  protected getNodeTemplateOutletContext(node: MarkdownNode): {
    $implicit: ProseNodeRenderContext;
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

  protected getCaretContext(node: MarkdownNode): ProseCaretContext {
    return {
      node,
      depth: this.openNodeDepthById().get(node.id) ?? -1,
    };
  }

  protected resolveCaretTemplate(
    defaultTemplate: TemplateRef<ProseCaretContext>,
  ): TemplateRef<ProseCaretContext> {
    const caret = this.caret();
    if (caret instanceof TemplateRef) {
      return caret;
    }

    return this.caretTemplateFromContent() ?? defaultTemplate;
  }

  protected handleLinkClick(
    mouseEvent: MouseEvent,
    node: ProseLinkNode,
    url: string,
  ): void {
    this.linkClick.emit({ mouseEvent, url, node });
  }

  protected getCitation(
    node: ProseCitationNode,
  ): ProseCitationRenderData {
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

  protected getCitationLabel(node: ProseCitationNode): string {
    return String(this.getCitation(node).number);
  }

  protected getCitationRenderContext(
    node: ProseCitationNode,
  ): ProseCitationRenderContext {
    return {
      node,
      citation: this.getCitation(node),
      label: this.getCitationLabel(node),
      isOpen: node.status !== 'complete',
      isComplete: this.parser.isComplete(),
    };
  }

  protected getCitationTemplateOutletContext(node: ProseCitationNode): {
    $implicit: ProseCitationRenderContext;
    node: ProseCitationNode;
    citation: ProseCitationRenderData;
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
    node: ProseCitationNode,
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

export { ProseComponent as Prose };
