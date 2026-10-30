/** Author-controlled layouts for small instructional diagrams, rendered on the server. */
export type Point = readonly [number, number];
interface DiagramText {
  readonly title: string;
  readonly caption: string;
  readonly description: string;
}
export interface DiagramNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly title: string;
  readonly detail?: string;
  readonly accent?: boolean;
  readonly fields?: readonly {
    readonly name: string;
    readonly type: string;
    readonly key?: 'PK' | 'FK' | 'PK/FK';
  }[];
}
export interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly points?: readonly Point[];
  readonly label?: {
    readonly text: string;
    readonly x: number;
    readonly y: number;
  };
  readonly dashed?: boolean;
  readonly arrow?: boolean;
  /** Cardinality labels, read with the equivalent text description. */
  readonly startLabel?: string;
  readonly endLabel?: string;
}
export interface GraphDiagram extends DiagramText {
  readonly kind: 'architecture' | 'flow' | 'state' | 'erd';
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
  readonly groups?: readonly {
    readonly label: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
}
export interface SequenceDiagram extends DiagramText {
  readonly kind: 'sequence';
  readonly participants: readonly {
    readonly id: string;
    readonly title: string;
  }[];
  readonly messages: readonly {
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly dashed?: boolean;
  }[];
}
export type DiagramDefinition = GraphDiagram | SequenceDiagram;

/** Wrap long tokens as well as prose; labels must stay inside their node. */
export function wrapLabel(value: string, limit: number): string[] {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError('Label width must be a positive integer');
  const lines: string[] = [];
  let line = '';
  for (const word of value.trim().split(/\s+/)) {
    let rest = word;
    if (line && line.length + word.length + 1 > limit) {
      lines.push(line);
      line = '';
    }
    while (rest.length > limit) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    line = line ? `${line} ${rest}` : rest;
  }
  if (line) lines.push(line);
  return lines;
}

export function nodeMetrics(node: DiagramNode) {
  const width = node.width ?? 220;
  if (!Number.isFinite(width) || width < 160)
    throw new RangeError('Diagram node width must be at least 160');
  const titles = wrapLabel(node.title, Math.floor((width - 40) / 10.5));
  const details = node.detail
    ? wrapLabel(node.detail, Math.floor((width - 40) / 9))
    : [];
  const headerHeight = 28 + titles.length * 24;
  const height = Math.max(
    88,
    headerHeight +
      details.length * 22 +
      (node.fields ? 12 + node.fields.length * 32 : 0) +
      20,
  );
  return { width, height, titles, details, headerHeight };
}

export function edgePoints(
  edge: DiagramEdge,
  nodes: readonly DiagramNode[],
): readonly Point[] {
  if (edge.points) return edge.points;
  const from = nodes.find((node) => node.id === edge.from);
  const to = nodes.find((node) => node.id === edge.to);
  if (!from || !to) throw new Error('Unknown diagram node');
  const a = nodeMetrics(from),
    b = nodeMetrics(to);
  if (from.x === to.x) {
    return from.y < to.y
      ? [
          [from.x + a.width / 2, from.y + a.height],
          [to.x + b.width / 2, to.y],
        ]
      : [
          [from.x + a.width / 2, from.y],
          [to.x + b.width / 2, to.y + b.height],
        ];
  }
  const right = from.x < to.x;
  const start: Point = [from.x + (right ? a.width : 0), from.y + a.height / 2];
  const end: Point = [to.x + (right ? 0 : b.width), to.y + b.height / 2];
  return start[1] === end[1]
    ? [start, end]
    : [
        start,
        [(start[0] + end[0]) / 2, start[1]],
        [(start[0] + end[0]) / 2, end[1]],
        end,
      ];
}

/** Reject broken diagrams at build time, including references and off-canvas geometry. */
export function validateDiagram(diagram: DiagramDefinition): void {
  for (const value of [diagram.title, diagram.caption, diagram.description]) {
    if (!value.trim())
      throw new Error('Diagram title, caption and description are required');
  }
  const items =
    diagram.kind === 'sequence' ? diagram.participants : diagram.nodes;
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || ids.has(item.id))
      throw new Error(`Duplicate or empty diagram ID: ${item.id}`);
    if (!item.title.trim()) throw new Error('Diagram nodes require a title');
    ids.add(item.id);
  }
  if (diagram.kind === 'sequence') {
    if (items.length < 2 || !diagram.messages.length)
      throw new Error('A sequence needs participants and messages');
    for (const message of diagram.messages) {
      if (!ids.has(message.from) || !ids.has(message.to))
        throw new Error('Unknown sequence participant');
      if (message.from === message.to)
        throw new Error('Use a separate participant for a sequence handoff');
      if (!message.label.trim())
        throw new Error('Sequence messages require labels');
    }
    return;
  }
  const inBounds = (x: number, y: number) =>
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    y >= 0 &&
    x <= diagram.width &&
    y <= diagram.height;
  if (
    !Number.isFinite(diagram.width) ||
    !Number.isFinite(diagram.height) ||
    diagram.width <= 0 ||
    diagram.height <= 0
  )
    throw new Error('Invalid diagram bounds');
  for (const node of diagram.nodes) {
    const { width, height } = nodeMetrics(node);
    if (
      width < 160 ||
      !inBounds(node.x, node.y) ||
      !inBounds(node.x + width, node.y + height)
    )
      throw new Error(`Diagram node outside bounds: ${node.id}`);
  }
  for (const group of diagram.groups ?? []) {
    if (
      !inBounds(group.x, group.y) ||
      !inBounds(group.x + group.width, group.y + group.height) ||
      group.width <= 0 ||
      group.height <= 0
    )
      throw new Error('Diagram group outside bounds');
  }
  for (const edge of diagram.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to))
      throw new Error(`Unknown diagram node: ${edge.from} → ${edge.to}`);
    const points = edgePoints(edge, diagram.nodes);
    if (points.length < 2 || points.some(([x, y]) => !inBounds(x, y)))
      throw new Error('Diagram connection outside bounds');
    if (edge.label && !inBounds(edge.label.x, edge.label.y))
      throw new Error('Diagram label outside bounds');
  }
}
