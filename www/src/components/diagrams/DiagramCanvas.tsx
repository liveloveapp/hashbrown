import { Fragment } from 'react';
import {
  type DiagramDefinition,
  type DiagramEdge,
  type DiagramNode,
  edgePoints,
  nodeMetrics,
  type Point,
  wrapLabel,
} from './diagram-types';
import styles from './Diagram.module.css';

function Connection({
  points,
  edge,
  labelLines,
}: {
  points: readonly Point[];
  labelLines?: readonly string[];
  edge: Pick<
    DiagramEdge,
    'label' | 'dashed' | 'arrow' | 'startLabel' | 'endLabel'
  >;
}) {
  const end = points.at(-1),
    before = points.at(-2);
  if (!end || !before) throw new Error('A diagram connection needs two points');
  const angle = Math.atan2(end[1] - before[1], end[0] - before[0]);
  const arrow = [
    end,
    [
      end[0] - 9 * Math.cos(angle - Math.PI / 6),
      end[1] - 9 * Math.sin(angle - Math.PI / 6),
    ],
    [
      end[0] - 9 * Math.cos(angle + Math.PI / 6),
      end[1] - 9 * Math.sin(angle + Math.PI / 6),
    ],
  ];
  return (
    <g className={edge.dashed ? styles.return : styles.connection}>
      <polyline points={points.map((p) => p.join(',')).join(' ')} />
      {edge.arrow !== false && (
        <polygon points={arrow.map((p) => p.join(',')).join(' ')} />
      )}
      {edge.label && (
        <text
          className={styles.edgeLabel}
          x={edge.label.x}
          y={edge.label.y}
          textAnchor="middle"
        >
          {labelLines
            ? labelLines.map((line, i) => (
                <tspan key={i} x={edge.label?.x} dy={i ? 20 : 0}>
                  {line}
                </tspan>
              ))
            : edge.label.text}
        </text>
      )}
      {edge.startLabel && (
        <text
          className={styles.cardinality}
          x={points[0][0] + 12}
          y={points[0][1] - 16}
        >
          {edge.startLabel}
        </text>
      )}
      {edge.endLabel && (
        <text
          className={styles.cardinality}
          x={end[0] - 12}
          y={end[1] - 16}
          textAnchor="end"
        >
          {edge.endLabel}
        </text>
      )}
    </g>
  );
}

function Node({ node }: { node: DiagramNode }) {
  const { width, height, titles, details, headerHeight } = nodeMetrics(node);
  return (
    <g
      data-diagram-node={node.id}
      transform={`translate(${node.x} ${node.y})`}
      className={node.accent ? styles.accentNode : styles.node}
    >
      <rect width={width} height={height} rx="8" />
      <text className={styles.nodeTitle} x="20" y="36">
        {titles.map((line, i) => (
          <tspan key={i} x="20" dy={i ? 24 : 0}>
            {line}
          </tspan>
        ))}
      </text>
      {details.length > 0 && (
        <text className={styles.nodeDetail} x="20" y={headerHeight + 10}>
          {details.map((line, i) => (
            <tspan key={i} x="20" dy={i ? 22 : 0}>
              {line}
            </tspan>
          ))}
        </text>
      )}
      {node.fields && (
        <>
          <path
            d={`M0 ${headerHeight + details.length * 22} H${width}`}
            className={styles.divider}
          />
          {node.fields.map((field, i) => (
            <Fragment key={field.name}>
              <text
                className={styles.field}
                x="16"
                y={headerHeight + details.length * 22 + 28 + i * 32}
              >
                {field.name}
              </text>
              <text
                className={styles.fieldType}
                x={width - 16}
                y={headerHeight + details.length * 22 + 28 + i * 32}
                textAnchor="end"
              >
                {field.key ? `${field.key} · ` : ''}
                {field.type}
              </text>
            </Fragment>
          ))}
        </>
      )}
    </g>
  );
}

/** SVG only: no client graph layout, foreignObject or marker IDs to duplicate in a dialog. */
export function DiagramCanvas({
  definition,
}: {
  definition: DiagramDefinition;
}) {
  if (definition.kind === 'sequence') {
    const lane = 188,
      padding = 88,
      width = padding * 2 + (definition.participants.length - 1) * lane;
    const x = (id: string) =>
      padding + definition.participants.findIndex((p) => p.id === id) * lane;
    const lines = definition.messages.map((message, i) =>
      wrapLabel(
        `${i + 1}  ${message.label}`,
        Math.max(
          16,
          Math.floor((Math.abs(x(message.from) - x(message.to)) - 32) / 8),
        ),
      ),
    );
    const maxLines = Math.max(...lines.map((label) => label.length));
    const headerBottom =
      16 +
      Math.max(
        ...definition.participants.map(
          (participant) =>
            nodeMetrics({ ...participant, x: 0, y: 0, width: 160 }).height,
        ),
      );
    const firstMessage = headerBottom + maxLines * 20 + 32;
    const rowHeight = Math.max(88, maxLines * 20 + 32);
    const height = firstMessage + definition.messages.length * rowHeight;
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: width, maxWidth: width }}
        role="img"
        aria-label={definition.title}
        className={styles.canvas}
      >
        {definition.participants.map((participant) => (
          <Fragment key={participant.id}>
            <path
              className={styles.lifeline}
              d={`M${x(participant.id)} 100 V${height - 24}`}
            />
            <Node
              node={{
                ...participant,
                x: x(participant.id) - 80,
                y: 16,
                width: 160,
              }}
            />
          </Fragment>
        ))}
        {definition.messages.map((message, i) => (
          <Connection
            key={i}
            points={[
              [x(message.from), firstMessage + i * rowHeight],
              [x(message.to), firstMessage + i * rowHeight],
            ]}
            labelLines={lines[i]}
            edge={{
              dashed: message.dashed,
              label: {
                text: `${i + 1}  ${message.label}`,
                x: (x(message.from) + x(message.to)) / 2,
                y:
                  firstMessage +
                  i * rowHeight -
                  20 -
                  (lines[i].length - 1) * 20,
              },
            }}
          />
        ))}
      </svg>
    );
  }
  return (
    <svg
      viewBox={`0 0 ${definition.width} ${definition.height}`}
      style={{ minWidth: definition.width, maxWidth: definition.width }}
      role="img"
      aria-label={definition.title}
      className={styles.canvas}
    >
      {definition.groups?.map((group) => (
        <g key={group.label}>
          <rect
            className={styles.boundary}
            x={group.x}
            y={group.y}
            width={group.width}
            height={group.height}
            rx="12"
          />
          <text className={styles.groupLabel} x={group.x + 16} y={group.y + 28}>
            {group.label}
          </text>
        </g>
      ))}
      {definition.edges.map((edge, i) => (
        <Connection
          key={i}
          points={edgePoints(edge, definition.nodes)}
          edge={edge}
        />
      ))}
      {definition.nodes.map((node) => (
        <Node key={node.id} node={node} />
      ))}
    </svg>
  );
}
