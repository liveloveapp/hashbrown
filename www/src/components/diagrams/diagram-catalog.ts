import type { DiagramDefinition } from './diagram-types';
import { SHARED_DIAGRAMS } from './catalog/shared';
import { LEARNING_DIAGRAMS } from './catalog/learning';
import { CONCEPT_DIAGRAM_DEFINITIONS } from './catalog/concepts';
import { RECIPE_DIAGRAM_DEFINITIONS } from './catalog/recipes';
import { INTEGRATION_DIAGRAM_DEFINITIONS } from './catalog/integrations';

export const DOCS_DIAGRAMS: Readonly<Record<string, DiagramDefinition>> = {
  ...SHARED_DIAGRAMS,
  ...LEARNING_DIAGRAMS,
  ...CONCEPT_DIAGRAM_DEFINITIONS,
  ...RECIPE_DIAGRAM_DEFINITIONS,
  ...INTEGRATION_DIAGRAM_DEFINITIONS,
};
