import { DiagramCanvas } from './DiagramCanvas';
import { DiagramFrame } from './DiagramFrame';
import { DOCS_DIAGRAMS } from './diagram-catalog';
import { type DiagramDefinition, validateDiagram } from './diagram-types';

export function DiagramFigure({
  definition,
  id,
}: {
  definition: DiagramDefinition;
  id: string;
}) {
  validateDiagram(definition);
  return (
    <DiagramFrame
      id={id}
      title={definition.title}
      caption={definition.caption}
      description={definition.description}
    >
      <DiagramCanvas definition={definition} />
    </DiagramFrame>
  );
}

/** Stable Markdown identifiers keep definitions shared across both framework guides. */
export function DocsDiagram({ diagram = '' }: { diagram?: string }) {
  const definition = Object.hasOwn(DOCS_DIAGRAMS, diagram)
    ? DOCS_DIAGRAMS[diagram]
    : undefined;
  if (!definition) throw new Error(`Unknown documentation diagram: ${diagram}`);
  return <DiagramFigure definition={definition} id={diagram} />;
}
