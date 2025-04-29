import * as s from './base';
import { HashbrownType, internal } from './base';

export function descriptionToTitleCase(description: string): string {
  const cleaned = description.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const words = cleaned.split(/\s+/).map((w) => w.toLowerCase());
  if (words.length === 0) return '';
  const [first, ...rest] = words;
  const core =
    first[0].toUpperCase() +
    first.slice(1) +
    rest.map((w) => w[0].toUpperCase() + w.slice(1)).join('');

  return /^\d/.test(core) ? `_${core}` : core;
}

/**
 * Converts a Hashbrown schema into a TypeScript type literal string.
 * Cyclic references will throw an error.
 */
export function toTypeScript(schema: HashbrownType): string {
  function printNode(
    node: HashbrownType,
    pathSeen: Set<HashbrownType> = new Set(),
  ): string {
    if (pathSeen.has(node)) {
      const desc = node[internal].definition.description || '<anonymous>';
      throw new Error(`Cycle detected in schema at "${desc}"`);
    }
    pathSeen.add(node);

    let result: string;
    if (s.isObjectType(node)) {
      const entries = Object.entries(node[internal].definition.shape);
      const lines = entries.map(([key, child]) => {
        // clone pathSeen for each branch
        return `  ${key}: ${printNode(child, new Set(pathSeen))};`;
      });
      result = `{
${lines.join('\n')}
}`;
    } else if (s.isArrayType(node)) {
      result = `Array<${printNode(
        node[internal].definition.element,
        new Set(pathSeen),
      )}>`;
    } else if (s.isAnyOfType(node)) {
      const union = node[internal].definition.options
        .map((opt) => printNode(opt, new Set(pathSeen)))
        .join(' | ');
      result = union;
    } else if (s.isEnumType(node)) {
      result = node[internal].definition.entries
        .map((e) => `"${e}"`)
        .join(' | ');
    } else if (s.isNullType(node)) {
      result = 'null';
    } else if (s.isStringType(node)) {
      result = 'string';
    } else if (s.isConstStringType(node)) {
      result = `"${node[internal].definition.value}"`;
    } else if (s.isNumberType(node) || s.isIntegerType(node)) {
      result = 'number';
    } else if (s.isBooleanType(node)) {
      result = 'boolean';
    } else {
      throw new Error(`Unknown node type: ${node[internal].definition.type}`);
    }

    return result;
  }

  return printNode(schema);
}
