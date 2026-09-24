import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { parseCanonicalReference } from './canonical-reference';
import { repoRoot } from './repo-root';

/** A piece of an api-extractor excerpt: plain text or a reference to a symbol. */
export interface ApiExcerptToken {
  kind: 'Content' | 'Reference';
  text: string;
  /** Set on `Reference` tokens, e.g. `@hashbrownai/react!UseChatOptions:interface`. */
  canonicalReference?: string;
}

/** A half-open range of excerpt token indexes. */
export interface ApiTokenRange {
  startIndex: number;
  endIndex: number;
}

/** A parameter of a function or method. */
export interface ApiMemberParam {
  parameterName: string;
  isOptional: boolean;
  parameterTypeTokenRange: ApiTokenRange;
}

/** A type parameter of a generic symbol. */
export interface ApiMemberTypeParam {
  typeParameterName: string;
  constraintTokenRange: ApiTokenRange;
  defaultTypeTokenRange: ApiTokenRange;
}

/** A member's parsed TSDoc comment. */
export interface ApiDocs {
  summary: string;
  usageNotes: string;
  remarks: string;
  deprecated: string;
  returns: string;
  see: string[];
  params: { name: string; description: string }[];
  examples: string[];
}

/** An api-extractor member (function, interface, property, namespace, …). */
export interface ApiMember {
  kind: string;
  name: string;
  canonicalReference: string;
  formattedContent: string;
  excerptTokens: ApiExcerptToken[];
  /** Tokens that spell `formattedContent`, with references marked. */
  overlayTokens?: ApiExcerptToken[];
  fileUrlPath?: string;
  isStatic?: boolean;
  returnTypeTokenRange?: ApiTokenRange;
  typeTokenRange?: ApiTokenRange;
  variableTypeTokenRange?: ApiTokenRange;
  parameters?: ApiMemberParam[];
  typeParameters?: ApiMemberTypeParam[];
  members?: ApiMember[];
  docs: ApiDocs;
}

/** One documented symbol and its overloads/members. */
export interface ApiSymbol {
  name: string;
  kind: string;
  canonicalReference: string;
  fileUrlPath?: string;
  isDeprecated: boolean;
  members: ApiMember[];
}

/** A symbol's entry in `api-report.min.json`. */
export interface MinimizedApiSymbol {
  kind: string;
  name: string;
  canonicalReference: string;
  isDeprecated: boolean;
}

/** The shape of `api-report.min.json`: symbols grouped by package. */
export interface MinimizedApiReport {
  packageNames: string[];
  packages: Record<
    string,
    { symbolNames: string[]; symbols: Record<string, MinimizedApiSymbol> }
  >;
}

const referenceRoot = () => join(repoRoot(), 'www/analog/src/app/reference');

/** List every symbol that has a reference JSON file, as `{ pkg, symbol }`. */
export function listSymbols(): { pkg: string; symbol: string }[] {
  const root = referenceRoot();
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((dir) =>
      readdirSync(join(root, dir.name))
        .filter((file) => file.endsWith('.json'))
        .map((file) => ({
          pkg: dir.name,
          symbol: file.replace(/\.json$/, ''),
        })),
    );
}

/**
 * Read one symbol's reference JSON, or `undefined` if it doesn't exist or the
 * path points outside the reference directory.
 *
 * @param pkg - Package directory, e.g. `react`.
 * @param symbol - Symbol file name without `.json`, e.g. `useChat`.
 */
export function readSymbol(pkg: string, symbol: string): ApiSymbol | undefined {
  const root = referenceRoot();
  const file = resolve(root, pkg, `${symbol}.json`);
  if (!file.startsWith(root + sep) || !existsSync(file)) {
    return undefined;
  }
  return JSON.parse(readFileSync(file, 'utf-8')) as ApiSymbol;
}

/** Read `api-report.min.json`, the package/symbol index the API pages and menu use. */
export function readApiReport(): MinimizedApiReport {
  const report = JSON.parse(
    readFileSync(join(referenceRoot(), 'api-report.min.json'), 'utf-8'),
  ) as MinimizedApiReport;
  return { packageNames: report.packageNames, packages: report.packages };
}

/** The deepest namespace path the Angular `ApiService` resolves (`Chat.Api.X`). */
const MAX_NAMESPACE_DEPTH = 2;

function findNamespace(
  members: ApiMember[] | undefined,
  name: string,
): ApiMember | undefined {
  const namespace = members?.find((m) => m.name === name);
  return namespace?.kind === 'Namespace' && namespace.members
    ? namespace
    : undefined;
}

/**
 * Load a symbol by its URL segments, like the Angular `ApiService`. A dotted
 * symbol (`s.string`, `Chat.Api.Message`) is a member of a namespace, up to
 * two namespaces deep; members sharing that name (an interface and a variable,
 * or overloads) are merged into one summary named after the first. Returns
 * `undefined` when anything along the path is missing.
 *
 * @param pkg - Package directory, e.g. `core`.
 * @param symbol - Symbol name, optionally dotted, e.g. `s.string`.
 */
export function loadReferenceData(
  pkg: string,
  symbol: string,
): ApiSymbol | undefined {
  const parts = symbol.split('.');
  const namespacePath = parts.slice(0, -1);
  const name = parts[parts.length - 1];
  if (namespacePath.length > MAX_NAMESPACE_DEPTH) {
    return undefined;
  }
  const file = readSymbol(pkg, namespacePath[0] ?? name);
  if (!file || namespacePath.length === 0) {
    return file;
  }
  const namespace = namespacePath.reduce<ApiMember | undefined>(
    (parent, segment, index) =>
      findNamespace(index === 0 ? file.members : parent?.members, segment),
    undefined,
  );
  const members = namespace?.members?.filter((m) => m.name === name) ?? [];
  if (members.length === 0) {
    return undefined;
  }
  const [first] = members;
  return {
    name: first.name,
    kind: first.kind,
    canonicalReference: first.canonicalReference,
    fileUrlPath: first.fileUrlPath,
    isDeprecated: Boolean(first.docs.deprecated),
    members,
  };
}

/**
 * Load the symbol a canonical reference points at, or `undefined` for
 * non-Hashbrown, private or unknown references.
 *
 * @param reference - e.g. `@hashbrownai/core!s.string:function(1)`.
 */
export function loadFromCanonicalReference(
  reference: string,
): ApiSymbol | undefined {
  const parsed = parseCanonicalReference(reference);
  if (
    !parsed ||
    parsed.isPrivate ||
    !parsed.package.startsWith('@hashbrownai/')
  ) {
    return undefined;
  }
  return loadReferenceData(
    parsed.package.slice('@hashbrownai/'.length),
    parsed.name,
  );
}

function namespaceMemberNames(member: ApiMember, depth: number): string[] {
  if (member.kind !== 'Namespace' || depth > MAX_NAMESPACE_DEPTH) {
    return [];
  }
  return (member.members ?? []).flatMap((child) => [
    parseCanonicalReference(child.canonicalReference)?.name ?? '',
    ...namespaceMemberNames(child, depth + 1),
  ]);
}

let symbolPages: { pkg: string; symbol: string }[] | undefined;

/**
 * Every API page the site serves: each top-level symbol, plus each namespace
 * member the Angular site linked to from its namespace pages (`s.string`,
 * `Chat.Api.AssistantMessage`), deduplicated. Cached; the reference data is
 * fixed for a build.
 */
export function listSymbolPages(): { pkg: string; symbol: string }[] {
  symbolPages ??= listSymbols().flatMap(({ pkg, symbol }) => {
    const members = readSymbol(pkg, symbol)?.members ?? [];
    const nested = [
      ...new Set(members.flatMap((m) => namespaceMemberNames(m, 1))),
    ].filter(
      (name) =>
        name.includes('.') && loadReferenceData(pkg, name) !== undefined,
    );
    return [{ pkg, symbol }, ...nested.map((name) => ({ pkg, symbol: name }))];
  });
  return symbolPages;
}
