import type { ApiExcerptToken, ApiMember } from '../../lib/api-reference';
import {
  type Excerpt,
  excerptFromFormattedContent,
  excerptFromTokens,
} from './excerpt';

const CONTAINER_KINDS = new Set(['Class', 'Interface', 'Enum']);
const METHOD_KINDS = new Set(['Method', 'PropertySignature']);

/** Whether a member renders as `header { members }` (class, interface, enum). */
export function isContainer(member: ApiMember): boolean {
  return CONTAINER_KINDS.has(member.kind);
}

/** Non-deprecated members first, keeping their order otherwise. */
export function deprecatedLast(members: ApiMember[]): ApiMember[] {
  return [
    ...members.filter((m) => !m.docs.deprecated),
    ...members.filter((m) => m.docs.deprecated),
  ];
}

/**
 * A member's signature: its formatted content, or its joined excerpt tokens
 * when it has none. Port of `SymbolExcerpt`'s choice.
 */
export function memberExcerpt(member: ApiMember): Excerpt {
  return member.formattedContent
    ? excerptFromFormattedContent(member.formattedContent, member.overlayTokens)
    : excerptFromTokens(member.excerptTokens);
}

/**
 * The first line of the API block: `interface X {` for containers, the whole
 * signature otherwise. Port of `SymbolApi.headerExcerptTokens`.
 */
export function headerExcerpt(member: ApiMember): Excerpt {
  return isContainer(member)
    ? excerptFromTokens([
        ...member.excerptTokens,
        { kind: 'Content', text: ' {' },
      ])
    : memberExcerpt(member);
}

/** Members listed inside the API block (containers and namespaces), deprecated last. */
export function bodyMembers(member: ApiMember): ApiMember[] {
  return isContainer(member) || member.kind === 'Namespace'
    ? deprecatedLast(member.members ?? [])
    : [];
}

/** The closing `}` for containers, or nothing. */
export function footerExcerpt(member: ApiMember): Excerpt | undefined {
  return isContainer(member)
    ? excerptFromTokens([{ kind: 'Content', text: '}' }])
    : undefined;
}

/** A documented parameter. Port of `SymbolParams.params`. */
export interface ParamView {
  name: string;
  required: boolean;
  excerpt: Excerpt;
  description: string;
}

/** A member's parameters with their types and doc descriptions. */
export function paramsOf(member: ApiMember): ParamView[] {
  return (member.parameters ?? []).map((param) => ({
    name: param.parameterName,
    required: !param.isOptional,
    excerpt: excerptFromTokens(
      member.excerptTokens.slice(
        param.parameterTypeTokenRange.startIndex,
        param.parameterTypeTokenRange.endIndex,
      ),
    ),
    description:
      member.docs.params.find((p) => p.name === param.parameterName)
        ?.description ?? '',
  }));
}

/** A type parameter and its constraint. Port of `SymbolTypeParams.params`. */
export interface TypeParamView {
  name: string;
  excerpt: Excerpt;
}

/** A member's type parameters with their constraints. */
export function typeParamsOf(member: ApiMember): TypeParamView[] {
  return (member.typeParameters ?? []).map((param) => ({
    name: param.typeParameterName,
    excerpt: excerptFromTokens(
      member.excerptTokens.slice(
        param.constraintTokenRange.startIndex,
        param.constraintTokenRange.endIndex,
      ),
    ),
  }));
}

/** A member's return type, if it has one. Port of `SymbolReturn(s).returns`. */
export function returnsOf(member: ApiMember): Excerpt | undefined {
  const range = member.returnTypeTokenRange;
  return range
    ? excerptFromTokens(
        member.excerptTokens.slice(range.startIndex, range.endIndex),
      )
    : undefined;
}

/** Methods and property signatures, deprecated last. Port of `SymbolMethods.methods`. */
export function methodsOf(member: ApiMember): ApiMember[] {
  return deprecatedLast(
    (member.members ?? []).filter((m) => METHOD_KINDS.has(m.kind)),
  );
}

/**
 * A method's signature without its leading name token and trailing `;`.
 * Port of `SymbolMethods.trimExcerptTokens`.
 */
export function trimExcerptTokens(
  tokens: ApiExcerptToken[],
): ApiExcerptToken[] {
  const rest = tokens.slice(1);
  const last = rest[rest.length - 1];
  return last?.kind === 'Content' && last.text === ';'
    ? rest.slice(0, -1)
    : rest;
}

/**
 * The GitHub source URL for a symbol's `.d.ts` path under `dist/`, or an empty
 * string for other paths. Port of `SymbolCodeLink.url`.
 *
 * @param fileUrlPath - e.g. `../../dist/packages/react/src/hooks/use-chat.d.ts`.
 */
export function sourceUrl(fileUrlPath: string | undefined): string {
  const [, fileName] = (fileUrlPath ?? '').split('dist/');
  return fileName
    ? `https://github.com/liveloveapp/hashbrown/blob/main/${fileName.replace('.d.ts', '.ts')}`
    : '';
}

/** Whether a member gets the parameters/returns panel. Port of `Symbol`'s condition. */
export function hasSignaturePanel(member: ApiMember): boolean {
  return Boolean(
    member.parameters?.length ||
    member.typeParameters?.length ||
    member.returnTypeTokenRange ||
    member.docs.usageNotes,
  );
}
