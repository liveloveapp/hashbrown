import * as s from './base';
import { HashbrownType, internal } from './base';

/**
 * Convert an arbitrary description into a camelCase identifier.
 *
 * - Strips out any non-alphanumeric characters
 * - Splits on whitespace
 * - Lowercases all words, then uppercases the first letter of each subsequent word
 * - Prefixes with `_` if the result would start with a digit
 */
export function descriptionToCamelCase(description: string): string {
  const cleaned = description.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const words = cleaned.split(/\s+/).map((w) => w.toLowerCase());
  if (words.length === 0) return '';
  const [first, ...rest] = words;
  const core =
    first + rest.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return /^\d/.test(core) ? `_${core}` : core;
}

/**
 * Walks the HashbrownType graph, finds any sub-schemas seen more than once
 * (excluding the root), assigns each a unique name, and emits a draft-07 JSON Schema
 * with a $defs section.  Cycles always become $refs.
 */
export function toJsonSchema(schema: HashbrownType) {
  const rootNode = schema;

  // 1) Collect repeated nodes
  const seen = new Set<HashbrownType>();
  const repeats = new Set<HashbrownType>();
  (function visit(n: HashbrownType, path: HashbrownType[]) {
    if (seen.has(n)) {
      repeats.add(n);
      return;
    }
    seen.add(n);

    if (s.isObjectType(n)) {
      Object.values(n[internal].definition.shape).forEach((child) =>
        visit(child, [...path, n]),
      );
    } else if (s.isArrayType(n)) {
      visit(n[internal].definition.element, [...path, n]);
    } else if (s.isAnyOfType(n)) {
      n[internal].definition.options.forEach((opt) => visit(opt, [...path, n]));
    }
  })(rootNode, []);

  // never put the root itself into $defs
  repeats.delete(rootNode);

  // 2) Assign each repeated node a unique camelCase name
  const defNameMap = new Map<HashbrownType, string>();
  const usedNames = new Set<string>();
  let anon = 1;
  for (const node of repeats) {
    const desc = node[internal].definition.description || `def${anon++}`;
    let name = descriptionToCamelCase(desc) || `def${anon++}`;
    if (usedNames.has(name)) {
      let i = 1;
      while (usedNames.has(`${name}${i}`)) i++;
      name = `${name}${i}`;
    }
    usedNames.add(name);
    defNameMap.set(node, name);
  }

  /**
   * Recursive printer.
   *
   * @param n         current node
   * @param isRoot    true only for the very top-level schema
   * @param inDef     if non-null, we're printing $defs[inDef] — any other def becomes $ref
   * @param pathSeen  tracks the chain of inlined nodes to catch cycles
   */
  function printNode(
    n: HashbrownType,
    isRoot = false,
    inDef: HashbrownType | null = null,
    pathSeen: Set<HashbrownType> = new Set(),
  ): any {
    // a) cycle back to the root
    if (!isRoot && n === rootNode) {
      return { $ref: '#' };
    }

    // b) any other shared def becomes a $ref
    if (defNameMap.has(n) && n !== inDef) {
      const nm = defNameMap.get(n)!;
      return { $ref: `#/$defs/${nm}` };
    }

    // c) catch self-cycles or mutual cycles in inline portions
    if (pathSeen.has(n)) {
      // if it’s named, ref it; otherwise point at root
      if (defNameMap.has(n)) {
        const nm = defNameMap.get(n)!;
        return { $ref: `#/$defs/${nm}` };
      } else {
        return { $ref: '#' };
      }
    }

    // d) inline this node
    pathSeen.add(n);

    let result: any;

    if (s.isObjectType(n)) {
      const props: Record<string, any> = {};
      for (const [k, child] of Object.entries(n[internal].definition.shape)) {
        props[k] = printNode(child, false, inDef, pathSeen);
      }
      result = {
        type: 'object',
        properties: props,
        required: Object.keys(n[internal].definition.shape),
        additionalProperties: false,
        description: n[internal].definition.description,
      };
    } else if (s.isArrayType(n)) {
      result = {
        type: 'array',
        items: printNode(
          n[internal].definition.element,
          false,
          inDef,
          pathSeen,
        ),
        description: n[internal].definition.description,
      };
    } else if (s.isAnyOfType(n)) {
      result = {
        anyOf: n[internal].definition.options.map((opt) =>
          printNode(opt, false, inDef, pathSeen),
        ),
        description: n[internal].definition.description,
      };
    } else if (s.isEnumType(n)) {
      result = {
        type: 'string',
        enum: n[internal].definition.entries,
        description: n[internal].definition.description,
      };
    } else if (s.isNullType(n)) {
      result = {
        type: 'null',
        description: n[internal].definition.description,
      };
    } else if (s.isStringType(n)) {
      result = {
        type: 'string',
        description: n[internal].definition.description,
      };
    } else if (s.isConstStringType(n)) {
      result = {
        type: 'string',
        const: n[internal].definition.value,
        description: n[internal].definition.description,
      };
    } else if (s.isNumberType(n)) {
      result = {
        type: 'number',
        description: n[internal].definition.description,
      };
    } else if (s.isIntegerType(n)) {
      result = {
        type: 'integer',
        description: n[internal].definition.description,
      };
    } else if (s.isBooleanType(n)) {
      result = {
        type: 'boolean',
        description: n[internal].definition.description,
      };
    } else {
      throw new Error(`Unknown node type: ${n[internal].definition.type}`);
    }

    pathSeen.delete(n);
    return result;
  }

  // 3) Build the $defs section
  const defs: Record<string, any> = {};
  for (const [node, name] of defNameMap.entries()) {
    // isRoot=false, inDef=node, fresh pathSeen
    defs[name] = printNode(node, false, node, new Set());
  }

  // 4) Print the root schema
  const rootPrinted = printNode(rootNode, true, null, new Set());

  // 5) Assemble and return
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...rootPrinted,
    ...(Object.keys(defs).length > 0 ? { $defs: defs } : {}),
  };
}
