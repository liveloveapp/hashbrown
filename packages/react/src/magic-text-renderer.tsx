import {
  type CitationDefinition,
  type MarkdownCitationReferenceNode,
  type MarkdownDocumentNode,
  type MarkdownNode,
  type MarkdownNodeType,
  type PartialMarkdownParserOptions,
} from '@cacheplane/partial-markdown';
import {
  type SegmenterOptions,
  type TextSegment,
  ɵcreateTextSegments,
  ɵsanitizeUrl,
} from '@hashbrownai/core';
import {
  createElement,
  Fragment,
  type MouseEvent,
  type ReactNode,
  useRef,
} from 'react';
import { useMagicTextParser } from './hooks/use-magic-text-parser';

/**
 * Metadata available when a citation node is rendered.
 *
 * @public
 */
export interface MagicTextCitationRenderData {
  id: string;
  number: number | string;
  definition?: CitationDefinition;
  url?: string;
}

/**
 * Props for the `MagicTextRenderer` component.
 *
 * @public
 */
export interface MagicTextRendererProps {
  /** Full Markdown source that grows over time. */
  children: string;
  /** Optional Cacheplane parser options. */
  parserOptions?: PartialMarkdownParserOptions;
  /** Optional text segmentation used for streaming animations. */
  segmenter?: SegmenterOptions;
  /** When true, finalizes the parser state after applying the latest text. */
  isComplete?: boolean;
  /** Caret rendering behavior for streaming output. */
  caret?: MagicTextCaret;
  /** Optional class applied to the root element. */
  className?: string;
  /** Called when a link or autolink is clicked. */
  onLinkClick?: (
    event: MouseEvent<HTMLAnchorElement>,
    url: string,
    node: MarkdownNode,
  ) => void;
  /** Called when a citation reference is clicked. */
  onCitationClick?: (
    event: MouseEvent<HTMLAnchorElement>,
    citation: MagicTextCitationRenderData,
    node: MarkdownCitationReferenceNode,
  ) => void;
  /** Optional custom renderers keyed by Markdown node type. */
  nodeRenderers?: MagicTextNodeRenderers;
}

/**
 * Props supplied to a custom node renderer.
 *
 * @public
 */
export interface MagicTextNodeRendererProps<
  TNode extends MarkdownNode = MarkdownNode,
> {
  /** The Cacheplane Markdown node being rendered. */
  node: TNode;
  /** Already-rendered child content for container nodes. */
  children: ReactNode;
  /** Default element tree produced for this node. */
  defaultNode: ReactNode;
  /** Citation metadata when rendering a citation reference. */
  citation?: MagicTextCitationRenderData;
}

/** Custom renderer callback for a specific Markdown node. @public */
export type MagicTextNodeRenderer<TNode extends MarkdownNode = MarkdownNode> = (
  props: MagicTextNodeRendererProps<TNode>,
) => ReactNode;

/** Render context supplied to caret renderer callbacks. @public */
export interface MagicTextCaretRenderProps {
  /** Whether the parser state is complete. */
  isComplete: boolean;
  /** The deepest currently streaming Markdown node, if any. */
  openNode: MarkdownNode | null;
}

/** Callback type for custom caret renderers. @public */
export type MagicTextCaretRenderer = (
  props: MagicTextCaretRenderProps,
) => ReactNode;

/** Supported caret prop values. @public */
export type MagicTextCaret = boolean | ReactNode | MagicTextCaretRenderer;

type MarkdownNodeOfType<TType extends MarkdownNodeType> = Extract<
  MarkdownNode,
  { type: TType }
>;

/** Supported key names for `nodeRenderers`. @public */
export type MagicTextNodeRendererKey =
  | 'node'
  | 'document'
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'list'
  | 'listItem'
  | 'codeBlock'
  | 'mathDisplay'
  | 'htmlBlock'
  | 'table'
  | 'tableRow'
  | 'tableCell'
  | 'thematicBreak'
  | 'text'
  | 'emphasis'
  | 'strong'
  | 'strikethrough'
  | 'inlineCode'
  | 'mathInline'
  | 'htmlInline'
  | 'softBreak'
  | 'hardBreak'
  | 'image'
  | 'link'
  | 'linkReference'
  | 'autolink'
  | 'citationReference';

type MagicTextNodeByRendererKey = {
  node: MarkdownNode;
  document: MarkdownNodeOfType<'document'>;
  paragraph: MarkdownNodeOfType<'paragraph'>;
  heading: MarkdownNodeOfType<'heading'>;
  blockquote: MarkdownNodeOfType<'blockquote'>;
  list: MarkdownNodeOfType<'list'>;
  listItem: MarkdownNodeOfType<'list-item'>;
  codeBlock: MarkdownNodeOfType<'code-block'>;
  mathDisplay: MarkdownNodeOfType<'math-display'>;
  htmlBlock: MarkdownNodeOfType<'html-block'>;
  table: MarkdownNodeOfType<'table'>;
  tableRow: MarkdownNodeOfType<'table-row'>;
  tableCell: MarkdownNodeOfType<'table-cell'>;
  thematicBreak: MarkdownNodeOfType<'thematic-break'>;
  text: MarkdownNodeOfType<'text'>;
  emphasis: MarkdownNodeOfType<'emphasis'>;
  strong: MarkdownNodeOfType<'strong'>;
  strikethrough: MarkdownNodeOfType<'strikethrough'>;
  inlineCode: MarkdownNodeOfType<'inline-code'>;
  mathInline: MarkdownNodeOfType<'math-inline'>;
  htmlInline: MarkdownNodeOfType<'html-inline'>;
  softBreak: MarkdownNodeOfType<'soft-break'>;
  hardBreak: MarkdownNodeOfType<'hard-break'>;
  image: MarkdownNodeOfType<'image'>;
  link: MarkdownNodeOfType<'link'>;
  linkReference: MarkdownNodeOfType<'link-reference'>;
  autolink: MarkdownNodeOfType<'autolink'>;
  citationReference: MarkdownNodeOfType<'citation-reference'>;
};

/** Custom renderers keyed by camelCase node names. @public */
export type MagicTextNodeRenderers = Partial<{
  [TKey in MagicTextNodeRendererKey]: MagicTextNodeRenderer<
    MagicTextNodeByRendererKey[TKey]
  >;
}>;

/** Helper for creating typed Magic Text node renderer maps. @public */
export function createMagicTextNodeRenderers<T extends MagicTextNodeRenderers>(
  renderers: T,
): T {
  return renderers;
}

type RenderContext = {
  citations: Map<string, CitationDefinition>;
  segmenter: SegmenterOptions;
  onLinkClickRef: { current: MagicTextRendererProps['onLinkClick'] };
  onCitationClickRef: { current: MagicTextRendererProps['onCitationClick'] };
  nodeRenderers?: MagicTextNodeRenderers;
  caretTargetNodeId: number | null;
  caretNode: ReactNode;
};

type ContainerNode = Extract<
  MarkdownNode,
  {
    type:
      | 'document'
      | 'paragraph'
      | 'heading'
      | 'blockquote'
      | 'list'
      | 'list-item'
      | 'table'
      | 'table-row'
      | 'table-cell'
      | 'emphasis'
      | 'strong'
      | 'strikethrough'
      | 'link'
      | 'link-reference';
  }
>;

const WORD_JOINER = '\u2060';
const DEFAULT_ROOT_CLASS = 'hb-magic-text-root';
const DEFAULT_CITATION_CLASS = 'hb-magic-text-citation';
const DEFAULT_CITATION_LABEL_CLASS = 'hb-magic-text-citation-label';
const DEFAULT_STYLES = `
  .${DEFAULT_ROOT_CLASS} .hb-magic-text-segment {
    animation: hb-magic-text-segment-enter 400ms ease-out;
  }

  @keyframes hb-magic-text-segment-enter {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .${DEFAULT_ROOT_CLASS} .${DEFAULT_CITATION_CLASS} { vertical-align: baseline; }
  .${DEFAULT_ROOT_CLASS} .${DEFAULT_CITATION_LABEL_CLASS} {
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
`;
const DEFAULT_STYLES_FALLBACK = DEFAULT_STYLES.replace(
  'animation: hb-magic-text-segment-enter 400ms ease-out;',
  'opacity: 1; transition: opacity 400ms ease-out;',
);

const NODE_TYPE_TO_RENDERER_KEY: Record<
  MarkdownNodeType,
  MagicTextNodeRendererKey
> = {
  document: 'document',
  paragraph: 'paragraph',
  heading: 'heading',
  blockquote: 'blockquote',
  list: 'list',
  'list-item': 'listItem',
  'code-block': 'codeBlock',
  'math-display': 'mathDisplay',
  'html-block': 'htmlBlock',
  table: 'table',
  'table-row': 'tableRow',
  'table-cell': 'tableCell',
  'thematic-break': 'thematicBreak',
  text: 'text',
  emphasis: 'emphasis',
  strong: 'strong',
  strikethrough: 'strikethrough',
  'inline-code': 'inlineCode',
  'math-inline': 'mathInline',
  'html-inline': 'htmlInline',
  'soft-break': 'softBreak',
  'hard-break': 'hardBreak',
  image: 'image',
  link: 'link',
  'link-reference': 'linkReference',
  autolink: 'autolink',
  'citation-reference': 'citationReference',
};

function renderWithOverride<TNode extends MarkdownNode>(
  node: TNode,
  context: RenderContext,
  defaultNode: ReactNode,
  children: ReactNode = null,
  citation?: MagicTextCitationRenderData,
): ReactNode {
  const rendererKey = NODE_TYPE_TO_RENDERER_KEY[node.type];
  const renderer = (context.nodeRenderers?.[rendererKey] ??
    context.nodeRenderers?.node) as MagicTextNodeRenderer<TNode> | undefined;
  return renderer
    ? renderer({ node, children, defaultNode, citation })
    : defaultNode;
}

function renderChildren(
  node: ContainerNode,
  context: RenderContext,
): ReactNode {
  return node.children.map((child, index) => (
    <Fragment key={child.id}>
      {renderNode(
        child,
        context,
        index > 0 && node.children[index - 1]?.type === 'citation-reference',
      )}
    </Fragment>
  ));
}

function renderCaret(nodeId: number, context: RenderContext): ReactNode {
  return context.caretTargetNodeId === nodeId ? context.caretNode : null;
}

function renderDefaultCaret(): ReactNode {
  return (
    <span
      aria-hidden
      className="hb-magic-text-caret"
      data-magic-text-caret
      style={{
        display: 'inline-block',
        width: '0.48em',
        height: '0.48em',
        marginInlineStart: '0.08em',
        verticalAlign: '-0.08em',
        borderRadius: '999px',
        backgroundColor: 'currentColor',
        opacity: 0.55,
      }}
    />
  );
}

function resolveCaretNode(
  caret: MagicTextCaret | undefined,
  props: MagicTextCaretRenderProps,
): ReactNode {
  if (caret === undefined || caret === false || caret === null) return null;
  if (caret === true) return renderDefaultCaret();
  return typeof caret === 'function' ? caret(props) : caret;
}

function renderTextSegments(
  node: MarkdownNodeOfType<'text'>,
  context: RenderContext,
  noBreakBefore: boolean,
): ReactNode {
  if (node.text.length === 0) return null;
  const segments = ɵcreateTextSegments(node.text, 0, {
    segmenter: context.segmenter,
    hasWarnedSegmenterUnavailable: false,
  }).segments;
  if (segments.length === 0) {
    return (
      <span
        key={`segment-${node.id}-full`}
        className="hb-magic-text-segment"
        data-magic-text-segment-kind="full"
        data-magic-text-whitespace="false"
      >
        {noBreakBefore ? `${WORD_JOINER}${node.text}` : node.text}
      </span>
    );
  }

  return segments.map((segment: TextSegment, index) => (
    <span
      key={`segment-${node.id}-${segment.start}-${segment.kind}`}
      className="hb-magic-text-segment"
      data-magic-text-segment-kind={segment.kind}
      data-magic-text-whitespace={String(segment.isWhitespace)}
    >
      {noBreakBefore && index === 0
        ? `${WORD_JOINER}${segment.text}`
        : segment.text}
    </span>
  ));
}

function handleLinkClick(
  context: RenderContext,
  node: MarkdownNode,
  url: string,
) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    context.onLinkClickRef.current?.(event, url, node);
  };
}

function findCitationUrl(definition?: CitationDefinition): string | undefined {
  const url = definition?.children.find(
    (
      node,
    ): node is MarkdownNodeOfType<'link'> | MarkdownNodeOfType<'autolink'> =>
      node.type === 'link' || node.type === 'autolink',
  )?.url;

  return url ? ɵsanitizeUrl(url) : undefined;
}

function getCitationRenderData(
  node: MarkdownCitationReferenceNode,
  context: RenderContext,
): MagicTextCitationRenderData {
  const definition = context.citations.get(node.refId);
  return {
    id: node.refId,
    number: node.index,
    definition,
    url: findCitationUrl(definition),
  };
}

function renderCitation(
  node: MarkdownCitationReferenceNode,
  context: RenderContext,
): ReactNode {
  const citation = getCitationRenderData(node, context);
  const label = String(citation.number);
  const content = citation.url ? (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      role="doc-noteref"
      className={DEFAULT_CITATION_LABEL_CLASS}
      onClick={(event) =>
        context.onCitationClickRef.current?.(event, citation, node)
      }
    >
      {label}
    </a>
  ) : (
    <span role="doc-noteref" className={DEFAULT_CITATION_LABEL_CLASS}>
      {label}
    </span>
  );
  const defaultNode = (
    <sup
      key={node.id}
      className={DEFAULT_CITATION_CLASS}
      data-magic-text-node={node.type}
      data-node-open={String(node.status !== 'complete')}
    >
      {content}
    </sup>
  );
  return renderWithOverride(node, context, defaultNode, null, citation);
}

function nodeAttrs(node: MarkdownNode) {
  return {
    'data-magic-text-node': node.type,
    'data-node-open': String(node.status !== 'complete'),
  };
}

function renderContainerNode(
  node: ContainerNode,
  context: RenderContext,
): ReactNode {
  const children = (
    <>
      {renderChildren(node, context)}
      {renderCaret(node.id, context)}
    </>
  );
  let defaultNode: ReactNode;
  switch (node.type) {
    case 'document':
      defaultNode = <Fragment key={node.id}>{children}</Fragment>;
      break;
    case 'paragraph':
      defaultNode = <p {...nodeAttrs(node)}>{children}</p>;
      break;
    case 'heading': {
      defaultNode = createElement(`h${node.level}`, nodeAttrs(node), children);
      break;
    }
    case 'blockquote':
      defaultNode = <blockquote {...nodeAttrs(node)}>{children}</blockquote>;
      break;
    case 'list': {
      const List = node.ordered ? 'ol' : 'ul';
      defaultNode = (
        <List
          {...nodeAttrs(node)}
          {...(node.ordered ? { start: node.start ?? undefined } : {})}
          data-list-tight={String(node.tight)}
        >
          {children}
        </List>
      );
      break;
    }
    case 'list-item':
      defaultNode = (
        <li {...nodeAttrs(node)}>
          {node.task ? (
            <input
              type="checkbox"
              checked={node.task.checked}
              readOnly
              disabled
            />
          ) : null}
          {children}
        </li>
      );
      break;
    case 'table':
      defaultNode = (
        <table {...nodeAttrs(node)}>
          <tbody>{children}</tbody>
        </table>
      );
      break;
    case 'table-row':
      defaultNode = <tr {...nodeAttrs(node)}>{children}</tr>;
      break;
    case 'table-cell': {
      const Cell =
        node.parent?.type === 'table-row' && node.parent.isHeader ? 'th' : 'td';
      defaultNode = (
        <Cell
          {...nodeAttrs(node)}
          style={{ textAlign: node.alignment ?? undefined }}
        >
          {children}
        </Cell>
      );
      break;
    }
    case 'emphasis':
      defaultNode = <em {...nodeAttrs(node)}>{children}</em>;
      break;
    case 'strong':
      defaultNode = <strong {...nodeAttrs(node)}>{children}</strong>;
      break;
    case 'strikethrough':
      defaultNode = <s {...nodeAttrs(node)}>{children}</s>;
      break;
    case 'link':
      defaultNode = (
        <a
          {...nodeAttrs(node)}
          href={ɵsanitizeUrl(node.url)}
          title={node.title || undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleLinkClick(context, node, node.url)}
        >
          {children}
        </a>
      );
      break;
    case 'link-reference':
      defaultNode = node.resolved ? (
        <a
          {...nodeAttrs(node)}
          href={ɵsanitizeUrl(node.url)}
          title={node.title || undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleLinkClick(context, node, node.url)}
        >
          {children}
        </a>
      ) : (
        <span {...nodeAttrs(node)}>{children}</span>
      );
      break;
  }
  return renderWithOverride(node, context, defaultNode, children);
}

function renderNode(
  node: MarkdownNode,
  context: RenderContext,
  noBreakBefore = false,
): ReactNode {
  if ('children' in node) {
    return renderContainerNode(node as ContainerNode, context);
  }

  let defaultNode: ReactNode;
  let children: ReactNode = null;
  switch (node.type) {
    case 'code-block':
      children = node.text;
      defaultNode = (
        <pre {...nodeAttrs(node)}>
          <code data-code-info={node.language || undefined}>
            {children}
            {renderCaret(node.id, context)}
          </code>
        </pre>
      );
      break;
    case 'math-display':
      children = `${node.delimiter === '$$' ? '$$' : '\\['}${node.text}${node.delimiter === '$$' ? '$$' : '\\]'}`;
      defaultNode = (
        <div {...nodeAttrs(node)}>
          {children}
          {renderCaret(node.id, context)}
        </div>
      );
      break;
    case 'html-block':
      children = node.raw;
      defaultNode = (
        <pre {...nodeAttrs(node)}>
          {children}
          {renderCaret(node.id, context)}
        </pre>
      );
      break;
    case 'thematic-break':
      defaultNode = <hr {...nodeAttrs(node)} />;
      break;
    case 'text':
      children = renderTextSegments(node, context, noBreakBefore);
      defaultNode = (
        <Fragment key={node.id}>
          {children}
          {renderCaret(node.id, context)}
        </Fragment>
      );
      break;
    case 'inline-code':
      children = node.text;
      defaultNode = (
        <code {...nodeAttrs(node)}>
          {children}
          {renderCaret(node.id, context)}
        </code>
      );
      break;
    case 'math-inline':
      children = `${node.delimiter === '$' ? '$' : '\\('}${node.text}${node.delimiter === '$' ? '$' : '\\)'}`;
      defaultNode = (
        <span {...nodeAttrs(node)}>
          {children}
          {renderCaret(node.id, context)}
        </span>
      );
      break;
    case 'html-inline':
      children = node.raw;
      defaultNode = (
        <span {...nodeAttrs(node)}>
          {children}
          {renderCaret(node.id, context)}
        </span>
      );
      break;
    case 'soft-break':
      children = '\n';
      defaultNode = <Fragment key={node.id}>{children}</Fragment>;
      break;
    case 'hard-break':
      defaultNode = <br {...nodeAttrs(node)} />;
      break;
    case 'image':
      defaultNode = (
        <img
          {...nodeAttrs(node)}
          src={ɵsanitizeUrl(node.url)}
          alt={node.alt}
          title={node.title || undefined}
        />
      );
      break;
    case 'autolink':
      children = node.text;
      defaultNode = (
        <a
          {...nodeAttrs(node)}
          href={ɵsanitizeUrl(node.url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleLinkClick(context, node, node.url)}
        >
          {children}
          {renderCaret(node.id, context)}
        </a>
      );
      break;
    case 'citation-reference':
      return renderCitation(node, context);
    default:
      return null;
  }
  return renderWithOverride(node, context, defaultNode, children);
}

function findDeepestOpenNode(node: MarkdownNode | null): MarkdownNode | null {
  if (!node || node.status === 'complete') return null;
  if ('children' in node) {
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = findDeepestOpenNode(node.children[index] ?? null);
      if (child) return child;
    }
  }
  return node.type === 'document' ? null : node;
}

/** React renderer for streaming Cacheplane Markdown output. @public */
export function MagicTextRenderer({
  children,
  parserOptions,
  segmenter = true,
  isComplete = false,
  caret,
  className,
  onLinkClick,
  onCitationClick,
  nodeRenderers,
}: MagicTextRendererProps) {
  const parserResult = useMagicTextParser(
    children ?? '',
    parserOptions,
    isComplete,
  );
  const rootNode: MarkdownDocumentNode | null = parserResult.rootNode;
  const onLinkClickRef = useRef(onLinkClick);
  const onCitationClickRef = useRef(onCitationClick);
  onLinkClickRef.current = onLinkClick;
  onCitationClickRef.current = onCitationClick;

  const openNode = findDeepestOpenNode(rootNode);
  const caretNode = resolveCaretNode(caret, {
    isComplete: parserResult.isComplete,
    openNode,
  });
  const context = {
    citations: rootNode?.citations ?? new Map<string, CitationDefinition>(),
    segmenter,
    onLinkClickRef,
    onCitationClickRef,
    nodeRenderers,
    caretTargetNodeId:
      !parserResult.isComplete && openNode && caretNode ? openNode.id : null,
    caretNode,
  } satisfies RenderContext;

  const rootClassName = className
    ? `${DEFAULT_ROOT_CLASS} ${className}`
    : DEFAULT_ROOT_CLASS;
  const styleText =
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
      ? DEFAULT_STYLES_FALLBACK
      : DEFAULT_STYLES;

  return (
    <>
      <style>{styleText}</style>
      <div className={rootClassName} data-magic-text-root>
        {rootNode ? renderNode(rootNode, context) : null}
      </div>
    </>
  );
}
