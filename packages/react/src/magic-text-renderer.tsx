import type {
  CitationDefinition,
  CitationState,
  MagicTextAstNode,
  MagicTextNodeType,
  MagicTextParserOptions,
  TextSegment,
} from '@hashbrownai/core';
import {
  Fragment,
  type MouseEvent,
  type ReactNode,
  useMemo,
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
}

/**
 * Props for the `MagicTextRenderer` component.
 *
 * @public
 */
export interface MagicTextRendererProps {
  /**
   * Full markdown source that grows over time.
   */
  children: string;

  /**
   * Optional parser option overrides.
   */
  options?: Partial<MagicTextParserOptions>;

  /**
   * When `true`, finalizes the parser state after applying the latest text.
   */
  isComplete?: boolean;

  /**
   * Caret rendering behavior for streaming output.
   *
   * - `false`/`undefined`: no caret
   * - `true`: render the default caret
   * - `ReactNode`: render a custom caret node
   * - function: render a custom caret node from parser state
   */
  caret?: MagicTextCaret;

  /**
   * Optional class applied to the root element.
   */
  className?: string;

  /**
   * Called when a link or autolink is clicked.
   */
  onLinkClick?: (
    event: MouseEvent<HTMLAnchorElement>,
    url: string,
    node: MagicTextAstNode,
  ) => void;

  /**
   * Called when a citation reference is clicked.
   */
  onCitationClick?: (
    event: MouseEvent<HTMLAnchorElement>,
    citation: MagicTextCitationRenderData,
    node: MagicTextAstNode,
  ) => void;

  /**
   * Optional custom renderers keyed by Magic Text node type.
   */
  nodeRenderers?: MagicTextNodeRenderers;
}

/**
 * Props supplied to a custom node renderer.
 *
 * @public
 */
export interface MagicTextNodeRendererProps<
  TNode extends MagicTextAstNode = MagicTextAstNode,
> {
  /**
   * The immutable AST node being rendered.
   */
  node: TNode;

  /**
   * Already-rendered child content for container nodes.
   */
  children: ReactNode;

  /**
   * Default element tree produced by `MagicTextRenderer` for this node.
   */
  defaultNode: ReactNode;

  /**
   * Citation metadata when rendering a citation node.
   */
  citation?: MagicTextCitationRenderData;
}

/**
 * Custom renderer callback for a specific Magic Text node.
 *
 * @public
 */
export type MagicTextNodeRenderer<
  TNode extends MagicTextAstNode = MagicTextAstNode,
> = (props: MagicTextNodeRendererProps<TNode>) => ReactNode;

/**
 * Render context supplied to caret renderer callbacks.
 *
 * @public
 */
export interface MagicTextCaretRenderProps {
  /**
   * Whether the parser state is complete for the current source text.
   */
  isComplete: boolean;

  /**
   * The deepest currently open AST node, if any.
   */
  openNode: MagicTextAstNode | null;
}

/**
 * Callback type for custom caret renderers.
 *
 * @public
 */
export type MagicTextCaretRenderer = (
  props: MagicTextCaretRenderProps,
) => ReactNode;

/**
 * Supported caret prop values.
 *
 * @public
 */
export type MagicTextCaret = boolean | ReactNode | MagicTextCaretRenderer;

type MagicTextNodeOfType<TNodeType extends MagicTextNodeType> = Extract<
  MagicTextAstNode,
  { type: TNodeType }
>;

/**
 * Supported key names for `nodeRenderers`.
 *
 * @public
 */
export type MagicTextNodeRendererKey =
  | 'node'
  | 'document'
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'list'
  | 'listItem'
  | 'codeBlock'
  | 'table'
  | 'tableRow'
  | 'tableCell'
  | 'thematicBreak'
  | 'text'
  | 'em'
  | 'strong'
  | 'strikethrough'
  | 'inlineCode'
  | 'softBreak'
  | 'hardBreak'
  | 'image'
  | 'link'
  | 'autolink'
  | 'citation';

type MagicTextNodeByRendererKey = {
  node: MagicTextAstNode;
  document: MagicTextNodeOfType<'document'>;
  paragraph: MagicTextNodeOfType<'paragraph'>;
  heading: MagicTextNodeOfType<'heading'>;
  blockquote: MagicTextNodeOfType<'blockquote'>;
  list: MagicTextNodeOfType<'list'>;
  listItem: MagicTextNodeOfType<'list-item'>;
  codeBlock: MagicTextNodeOfType<'code-block'>;
  table: MagicTextNodeOfType<'table'>;
  tableRow: MagicTextNodeOfType<'table-row'>;
  tableCell: MagicTextNodeOfType<'table-cell'>;
  thematicBreak: MagicTextNodeOfType<'thematic-break'>;
  text: MagicTextNodeOfType<'text'>;
  em: MagicTextNodeOfType<'em'>;
  strong: MagicTextNodeOfType<'strong'>;
  strikethrough: MagicTextNodeOfType<'strikethrough'>;
  inlineCode: MagicTextNodeOfType<'inline-code'>;
  softBreak: MagicTextNodeOfType<'soft-break'>;
  hardBreak: MagicTextNodeOfType<'hard-break'>;
  image: MagicTextNodeOfType<'image'>;
  link: MagicTextNodeOfType<'link'>;
  autolink: MagicTextNodeOfType<'autolink'>;
  citation: MagicTextNodeOfType<'citation'>;
};

/**
 * Custom renderers keyed by camelCase node names.
 *
 * @public
 */
export type MagicTextNodeRenderers = Partial<{
  [TKey in MagicTextNodeRendererKey]: MagicTextNodeRenderer<
    MagicTextNodeByRendererKey[TKey]
  >;
}>;

/**
 * Helper for creating typed Magic Text node renderer maps.
 *
 * @public
 */
export function createMagicTextNodeRenderers<T extends MagicTextNodeRenderers>(
  renderers: T,
): T {
  return renderers;
}

type RenderContext = {
  nodeById: Map<number, MagicTextAstNode>;
  citations: CitationState;
  onLinkClickRef: { current: MagicTextRendererProps['onLinkClick'] };
  onCitationClickRef: { current: MagicTextRendererProps['onCitationClick'] };
  nodeRenderers?: MagicTextNodeRenderers;
  caretTargetNodeId: number | null;
  caretNode: ReactNode;
};

type MagicTextTextNode = Extract<MagicTextAstNode, { type: 'text' }>;
type MagicTextCitationNode = Extract<MagicTextAstNode, { type: 'citation' }>;

const WORD_JOINER = '\u2060';
const DEFAULT_ROOT_CLASS = 'hb-magic-text-root';
const DEFAULT_CITATION_CLASS = 'hb-magic-text-citation';
const DEFAULT_CITATION_LABEL_CLASS = 'hb-magic-text-citation-label';
const DEFAULT_STYLES = `
  .${DEFAULT_ROOT_CLASS} .hb-magic-text-segment {
    opacity: 1;
    transition: opacity 180ms ease-out;
    @starting-style {
      opacity: 0;
    }
  }

  .${DEFAULT_ROOT_CLASS} .${DEFAULT_CITATION_CLASS} {
    vertical-align: baseline;
  }

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

const DEFAULT_STYLES_FALLBACK = `
  .${DEFAULT_ROOT_CLASS} .hb-magic-text-segment {
    opacity: 1;
    transition: opacity 180ms ease-out;
  }

  .${DEFAULT_ROOT_CLASS} .${DEFAULT_CITATION_CLASS} {
    vertical-align: baseline;
  }

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

type ContainerNodeType = Extract<
  MagicTextNodeType,
  | 'document'
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'list'
  | 'list-item'
  | 'table'
  | 'table-row'
  | 'table-cell'
  | 'em'
  | 'strong'
  | 'strikethrough'
  | 'link'
>;

const NODE_TYPE_TO_RENDERER_KEY: Record<
  MagicTextNodeType,
  MagicTextNodeRendererKey
> = {
  document: 'document',
  paragraph: 'paragraph',
  heading: 'heading',
  blockquote: 'blockquote',
  list: 'list',
  'list-item': 'listItem',
  'code-block': 'codeBlock',
  table: 'table',
  'table-row': 'tableRow',
  'table-cell': 'tableCell',
  'thematic-break': 'thematicBreak',
  text: 'text',
  em: 'em',
  strong: 'strong',
  strikethrough: 'strikethrough',
  'inline-code': 'inlineCode',
  'soft-break': 'softBreak',
  'hard-break': 'hardBreak',
  image: 'image',
  link: 'link',
  autolink: 'autolink',
  citation: 'citation',
};

function renderWithOverride<TNode extends MagicTextAstNode>(
  node: TNode,
  context: RenderContext,
  defaultNode: ReactNode,
  children: ReactNode = null,
  citation?: MagicTextCitationRenderData,
): ReactNode {
  const rendererKey = NODE_TYPE_TO_RENDERER_KEY[node.type];
  const renderer = (context.nodeRenderers?.[rendererKey] ??
    context.nodeRenderers?.node) as MagicTextNodeRenderer<TNode> | undefined;

  if (!renderer) {
    return defaultNode;
  }

  return renderer({
    node,
    children,
    defaultNode,
    citation,
  });
}

function renderChildren(
  node: { children: number[] },
  context: RenderContext,
): ReactNode {
  return node.children.map((childId) => {
    const childNode = context.nodeById.get(childId);

    if (!childNode) {
      return null;
    }

    return <Fragment key={childId}>{renderNode(childNode, context)}</Fragment>;
  });
}

function renderCaret(nodeId: number, context: RenderContext): ReactNode {
  if (context.caretTargetNodeId !== nodeId) {
    return null;
  }

  return <Fragment key={`caret-${nodeId}`}>{context.caretNode}</Fragment>;
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
  if (caret === undefined || caret === false || caret === null) {
    return null;
  }

  if (caret === true) {
    return renderDefaultCaret();
  }

  if (typeof caret === 'function') {
    return caret(props);
  }

  return caret;
}

function renderTextSegments(node: MagicTextTextNode): ReactNode {
  if (node.text.length === 0) {
    return null;
  }

  if (node.segments.length === 0) {
    return (
      <span
        key={`segment-${node.id}-full`}
        className="hb-magic-text-segment"
        data-magic-text-segment-kind="full"
        data-magic-text-whitespace="false"
      >
        {node.text}
      </span>
    );
  }

  return node.segments.map((segment: TextSegment) => (
    <span
      key={`segment-${node.id}-${segment.start}-${segment.kind}`}
      className="hb-magic-text-segment"
      data-magic-text-segment-kind={segment.kind}
      data-magic-text-whitespace={String(segment.isWhitespace)}
    >
      {segment.noBreakBefore ? `${WORD_JOINER}${segment.text}` : segment.text}
    </span>
  ));
}

function handleLinkClick(
  context: RenderContext,
  node: MagicTextAstNode,
  url: string,
) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    context.onLinkClickRef.current?.(event, url, node);
  };
}

function getCitationRenderData(
  node: MagicTextCitationNode,
  context: RenderContext,
): MagicTextCitationRenderData {
  const number =
    node.number ?? context.citations.numbers[node.idRef] ?? node.idRef;
  const definition = context.citations.definitions[node.idRef];
  return {
    id: node.idRef,
    number,
    definition,
  } satisfies MagicTextCitationRenderData;
}

function renderDefaultCitation(
  node: MagicTextCitationNode,
  context: RenderContext,
  citation: MagicTextCitationRenderData,
): ReactNode {
  const label = String(citation.number);
  const href = citation.definition?.url;

  if (!href) {
    return (
      <sup
        key={node.id}
        className={DEFAULT_CITATION_CLASS}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        <span
          role="doc-noteref"
          className={DEFAULT_CITATION_LABEL_CLASS}
        >
          {label}
        </span>
      </sup>
    );
  }

  return (
    <sup
      key={node.id}
      className={DEFAULT_CITATION_CLASS}
      data-magic-text-node={node.type}
      data-node-open={String(!node.closed)}
    >
      <a
        href={href}
        role="doc-noteref"
        className={DEFAULT_CITATION_LABEL_CLASS}
        onClick={(event) => {
          context.onCitationClickRef.current?.(event, citation, node);
        }}
      >
        {label}
      </a>
    </sup>
  );
}

function renderContainerNode(
  node: Extract<MagicTextAstNode, { type: ContainerNodeType }>,
  context: RenderContext,
): ReactNode {
  const children = (
    <>
      {renderChildren(node, context)}
      {renderCaret(node.id, context)}
    </>
  );

  if (node.type === 'document') {
    return renderWithOverride(
      node,
      context,
      <Fragment key={node.id}>{children}</Fragment>,
      children,
    );
  }

  if (node.type === 'paragraph') {
    const defaultNode = (
      <p
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        {children}
      </p>
    );
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'heading') {
    const headingTag = `h${node.level}` as const;
    const defaultNode =
      headingTag === 'h1' ? (
        <h1
          key={node.id}
          data-magic-text-node={node.type}
          data-node-open={String(!node.closed)}
        >
          {children}
        </h1>
      ) : headingTag === 'h2' ? (
        <h2
          key={node.id}
          data-magic-text-node={node.type}
          data-node-open={String(!node.closed)}
        >
          {children}
        </h2>
      ) : headingTag === 'h3' ? (
        <h3
          key={node.id}
          data-magic-text-node={node.type}
          data-node-open={String(!node.closed)}
        >
          {children}
        </h3>
      ) : headingTag === 'h4' ? (
        <h4
          key={node.id}
          data-magic-text-node={node.type}
          data-node-open={String(!node.closed)}
        >
          {children}
        </h4>
      ) : headingTag === 'h5' ? (
        <h5
          key={node.id}
          data-magic-text-node={node.type}
          data-node-open={String(!node.closed)}
        >
          {children}
        </h5>
      ) : (
        <h6
          key={node.id}
          data-magic-text-node={node.type}
          data-node-open={String(!node.closed)}
        >
          {children}
        </h6>
      );
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'blockquote') {
    const defaultNode = (
      <blockquote
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        {children}
      </blockquote>
    );
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'list') {
    if (node.ordered) {
      const defaultNode = (
        <ol
          key={node.id}
          start={node.start ?? undefined}
          data-magic-text-node={node.type}
          data-node-open={String(!node.closed)}
          data-list-tight={String(node.tight)}
        >
          {children}
        </ol>
      );
      return renderWithOverride(node, context, defaultNode, children);
    }

    const defaultNode = (
      <ul
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
        data-list-tight={String(node.tight)}
      >
        {children}
      </ul>
    );
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'list-item') {
    const defaultNode = (
      <li
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        {children}
      </li>
    );
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'table') {
    const defaultNode = (
      <table
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        <tbody>{children}</tbody>
      </table>
    );
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'table-row') {
    const defaultNode = (
      <tr
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        {children}
      </tr>
    );
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'table-cell') {
    const parent =
      node.parentId == null ? undefined : context.nodeById.get(node.parentId);
    const isHeaderRow = parent?.type === 'table-row' && parent.isHeader;
    if (isHeaderRow) {
      const defaultNode = (
        <th
          key={node.id}
          data-magic-text-node={node.type}
          data-node-open={String(!node.closed)}
        >
          {children}
        </th>
      );
      return renderWithOverride(node, context, defaultNode, children);
    }

    const defaultNode = (
      <td
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        {children}
      </td>
    );
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'em') {
    const defaultNode = (
      <em
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        {children}
      </em>
    );
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'strong') {
    const defaultNode = (
      <strong
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        {children}
      </strong>
    );
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'strikethrough') {
    const defaultNode = (
      <s
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        {children}
      </s>
    );
    return renderWithOverride(node, context, defaultNode, children);
  }

  const defaultNode = (
    <a
      key={node.id}
      href={node.url}
      title={node.title}
      onClick={handleLinkClick(context, node, node.url)}
      data-magic-text-node={node.type}
      data-node-open={String(!node.closed)}
    >
      {children}
    </a>
  );
  return renderWithOverride(node, context, defaultNode, children);
}

function renderNode(node: MagicTextAstNode, context: RenderContext): ReactNode {
  if (
    node.type === 'document' ||
    node.type === 'paragraph' ||
    node.type === 'heading' ||
    node.type === 'blockquote' ||
    node.type === 'list' ||
    node.type === 'list-item' ||
    node.type === 'table' ||
    node.type === 'table-row' ||
    node.type === 'table-cell' ||
    node.type === 'em' ||
    node.type === 'strong' ||
    node.type === 'strikethrough' ||
    node.type === 'link'
  ) {
    return renderContainerNode(node, context);
  }

  if (node.type === 'code-block') {
    const defaultNode = (
      <pre
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        <code data-code-info={node.info ?? undefined}>
          {node.text}
          {renderCaret(node.id, context)}
        </code>
      </pre>
    );
    return renderWithOverride(node, context, defaultNode);
  }

  if (node.type === 'thematic-break') {
    const defaultNode = (
      <hr
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      />
    );
    return renderWithOverride(node, context, defaultNode);
  }

  if (node.type === 'text') {
    const children = renderTextSegments(node);
    const defaultNode = <Fragment key={node.id}>{children}</Fragment>;
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'inline-code') {
    const defaultNode = (
      <code
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        {node.text}
      </code>
    );
    return renderWithOverride(node, context, defaultNode, node.text);
  }

  if (node.type === 'soft-break') {
    const children = '\n';
    const defaultNode = <Fragment key={node.id}>{children}</Fragment>;
    return renderWithOverride(node, context, defaultNode, children);
  }

  if (node.type === 'hard-break') {
    const defaultNode = (
      <br
        key={node.id}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      />
    );
    return renderWithOverride(node, context, defaultNode);
  }

  if (node.type === 'image') {
    const defaultNode = (
      <img
        key={node.id}
        src={node.url}
        alt={node.alt}
        title={node.title}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      />
    );
    return renderWithOverride(node, context, defaultNode);
  }

  if (node.type === 'autolink') {
    const defaultNode = (
      <a
        key={node.id}
        href={node.url}
        onClick={handleLinkClick(context, node, node.url)}
        data-magic-text-node={node.type}
        data-node-open={String(!node.closed)}
      >
        {node.text}
      </a>
    );
    return renderWithOverride(node, context, defaultNode, node.text);
  }

  const citation = getCitationRenderData(node, context);
  const defaultNode = renderDefaultCitation(node, context, citation);
  return renderWithOverride(node, context, defaultNode, null, citation);
}

/**
 * React renderer for streaming Magic Text parser output.
 *
 * @public
 */
export function MagicTextRenderer({
  children,
  options,
  isComplete = false,
  caret,
  className,
  onLinkClick,
  onCitationClick,
  nodeRenderers,
}: MagicTextRendererProps) {
  const text = children ?? '';
  const parserState = useMagicTextParser(text, options, isComplete);
  const onLinkClickRef =
    useRef<MagicTextRendererProps['onLinkClick']>(onLinkClick);
  const onCitationClickRef =
    useRef<MagicTextRendererProps['onCitationClick']>(onCitationClick);
  onLinkClickRef.current = onLinkClick;
  onCitationClickRef.current = onCitationClick;

  const nodeById = useMemo(() => {
    const map = new Map<number, MagicTextAstNode>();

    for (const node of parserState.nodes) {
      map.set(node.id, node);
    }

    return map;
  }, [parserState.nodes]);

  const context = useMemo(() => {
    const openNode = findDeepestOpenRenderableNode(parserState.stack, nodeById);
    const caretNode = resolveCaretNode(caret, {
      isComplete: parserState.isComplete,
      openNode,
    });
    const caretTargetNodeId =
      !parserState.isComplete && openNode != null && caretNode != null
        ? openNode.id
        : null;

    return {
      nodeById,
      citations: parserState.citations,
      onLinkClickRef,
      onCitationClickRef,
      nodeRenderers,
      caretTargetNodeId,
      caretNode,
    };
  }, [
    nodeById,
    parserState.citations,
    parserState.isComplete,
    parserState.stack,
    nodeRenderers,
    caret,
  ]);

  const rootNode =
    parserState.rootId == null ? undefined : nodeById.get(parserState.rootId);
  const rootClassName = className
    ? `${DEFAULT_ROOT_CLASS} ${className}`
    : DEFAULT_ROOT_CLASS;
  const styleText =
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
      ? DEFAULT_STYLES_FALLBACK
      : DEFAULT_STYLES;

  if (!rootNode) {
    return (
      <>
        <style>{styleText}</style>
        <div className={rootClassName} data-magic-text-root />
      </>
    );
  }

  return (
    <>
      <style>{styleText}</style>
      <div className={rootClassName} data-magic-text-root>
        {renderNode(rootNode, context)}
      </div>
    </>
  );
}

function findDeepestOpenRenderableNode(
  stack: number[],
  nodeById: Map<number, MagicTextAstNode>,
): MagicTextAstNode | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const candidate = nodeById.get(stack[index]) ?? null;
    if (candidate && candidate.type !== 'document') {
      return candidate;
    }
  }

  return null;
}
