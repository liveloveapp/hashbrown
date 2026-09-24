import type {
  MinimizedApiReport,
  MinimizedApiSymbol,
} from '../../lib/api-reference';

/** One package's symbols as the API index lists them. */
export interface ApiIndexPackage {
  packageName: string;
  symbols: MinimizedApiSymbol[];
}

/**
 * The API index's visible symbols: packages in report order, each with its
 * non-deprecated symbols that match the selected kind (if any) and contain the
 * search term (case-insensitive). Packages left empty are dropped. Ports
 * `ApiIndexPage.filteredPackages`.
 *
 * @param report - The minified API report.
 * @param kind - Selected kind, e.g. `Function`; empty for all kinds.
 * @param term - Search term; empty for all names.
 */
export function filterPackages(
  report: MinimizedApiReport,
  kind: string,
  term: string,
): ApiIndexPackage[] {
  const needle = term.toLocaleLowerCase();
  return report.packageNames.flatMap((packageName) => {
    const pkg = report.packages[packageName];
    const symbols = pkg.symbolNames
      .map((name) => pkg.symbols[name])
      .filter(
        (symbol) =>
          (!kind || symbol.kind === kind) &&
          !symbol.isDeprecated &&
          (!needle || symbol.name.toLocaleLowerCase().includes(needle)),
      );
    return symbols.length > 0 ? [{ packageName, symbols }] : [];
  });
}

/**
 * Every symbol kind in the report, once each, in the order first seen.
 *
 * @param report - The minified API report.
 */
export function listKinds(report: MinimizedApiReport): string[] {
  const kinds = Object.values(report.packages).flatMap((pkg) =>
    Object.values(pkg.symbols).map((symbol) => symbol.kind),
  );
  return [...new Set(kinds.filter(Boolean))];
}

/**
 * The kind filter after clicking a kind chip: clicking the selected kind
 * clears the filter, any other kind selects it.
 *
 * @param selected - The currently selected kind, or empty.
 * @param kind - The clicked kind.
 */
export function toggleKind(selected: string, kind: string): string {
  return selected === kind ? '' : kind;
}
