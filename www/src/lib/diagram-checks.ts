/** Serializable browser measurements. Coordinates use rendered CSS pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DiagramGeometry {
  fonts: { family: string; loaded: boolean }[];
  canvas: Box;
  nodes: { id: string; box: Box }[];
  texts: { text: string; node?: string; box: Box }[];
  viewportWidth: number;
  documentWidth: number;
  windowWidth: number;
  naturalWidth: number;
}
const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x - 2 &&
  inner.y >= outer.y - 2 &&
  inner.x + inner.width <= outer.x + outer.width + 2 &&
  inner.y + inner.height <= outer.y + outer.height + 2;
const overlaps = (a: Box, b: Box) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 2 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 2;

export function inventoryIssues(
  expected: string[],
  actual: string[],
  catalog: string[],
): string[] {
  const issues: string[] = [];
  if (!expected.length) issues.push('Empty diagram inventory');
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    issues.push(
      `Placement mismatch: expected ${expected.join(',')}; rendered ${actual.join(',')}`,
    );
  for (const id of expected)
    if (!catalog.includes(id)) issues.push(`Unknown diagram: ${id}`);
  return issues;
}

export function geometryIssues(
  snapshot: DiagramGeometry,
  desktop: boolean,
): string[] {
  const issues: string[] = [];
  const { canvas, nodes, texts } = snapshot;
  if (!snapshot.fonts.length || snapshot.fonts.some((font) => !font.loaded))
    issues.push('Required diagram font did not load');
  if (!texts.length || !nodes.length || !canvas.width || !canvas.height)
    issues.push('Empty rendered geometry');
  if (snapshot.documentWidth > snapshot.windowWidth + 1)
    issues.push('Diagram causes page overflow');
  if (desktop && canvas.width > snapshot.viewportWidth + 1)
    issues.push('Diagram overflows desktop article');
  if (canvas.width + 1 < snapshot.naturalWidth)
    issues.push('Diagram text shrunk below natural size');
  for (const [i, node] of nodes.entries()) {
    if (!contains(canvas, node.box))
      issues.push(`Node outside canvas: ${node.id}`);
    for (const other of nodes.slice(i + 1))
      if (overlaps(node.box, other.box))
        issues.push(`Overlapping nodes: ${node.id}/${other.id}`);
  }
  for (const [i, text] of texts.entries()) {
    if (!contains(canvas, text.box))
      issues.push(`Text outside canvas: ${text.text}`);
    const node = nodes.find((node) => node.id === text.node);
    if (node && !contains(node.box, text.box))
      issues.push(`Text outside node ${node.id}: ${text.text}`);
    if (!text.node && nodes.some((node) => overlaps(node.box, text.box)))
      issues.push(`Edge/group label overlaps node: ${text.text}`);
    for (const other of texts.slice(i + 1))
      if (overlaps(text.box, other.box))
        issues.push(`Diagram text overlap: ${text.text}/${other.text}`);
  }
  return issues;
}
