import type {
  ApiDocs,
  ApiMember,
  ApiSymbol,
} from '../../src/lib/api-reference';

/** Build API docs with empty defaults. */
export function docs(overrides: Partial<ApiDocs> = {}): ApiDocs {
  return {
    summary: '',
    usageNotes: '',
    remarks: '',
    deprecated: '',
    returns: '',
    see: [],
    params: [],
    examples: [],
    ...overrides,
  };
}

/** Build an API member with empty defaults. */
export function member(
  overrides: Partial<ApiMember> & Pick<ApiMember, 'kind' | 'name'>,
): ApiMember {
  return {
    canonicalReference: `@hashbrownai/core!${overrides.name}:type`,
    formattedContent: '',
    excerptTokens: [],
    docs: docs(),
    ...overrides,
  };
}

/** Wrap members in a symbol summary named after the first one. */
export function summary(members: ApiMember[]): ApiSymbol {
  const [first] = members;
  return {
    name: first.name,
    kind: first.kind,
    canonicalReference: first.canonicalReference,
    fileUrlPath: '../../dist/packages/core/src/fixture.d.ts',
    isDeprecated: Boolean(first.docs.deprecated),
    members,
  };
}
