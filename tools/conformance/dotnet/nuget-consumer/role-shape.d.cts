/** Immutable, complete application-role inputs required by package launches. */
export interface PackageRole {
  readonly directory: string;
  readonly executable: string;
  readonly library: string;
  readonly launcher: string;
  readonly compile: readonly string[];
  readonly evaluation: Readonly<Record<string, unknown>>;
  readonly files: Readonly<Record<string, string>>;
  readonly inputs: Readonly<Record<string, string>>;
  readonly runtimeInputs: Readonly<Record<string, string>>;
  readonly runtimeTrees: readonly string[];
}

/** Prepared package metadata fields used by the synchronous launch guard. */
export interface PackageRoleMetadata {
  readonly root: string;
  readonly sdkRoot: string;
  readonly repository: string;
  readonly roles: Readonly<Record<'fixture' | 'probe', PackageRole>>;
  readonly sourceTrees: readonly {
    readonly directory: string;
    readonly exclude: readonly string[];
  }[];
  readonly files: Readonly<Record<string, string>>;
  readonly sources: Readonly<Record<string, string>>;
  readonly archive: string;
  readonly sha256: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly loaded: { readonly identity: string; readonly sha256: string };
}

/** Rejects incomplete or independently resealed package-role evidence before any launch or qualification effect. */
export function assertPackageRoles(
  metadata: unknown,
): asserts metadata is PackageRoleMetadata;
