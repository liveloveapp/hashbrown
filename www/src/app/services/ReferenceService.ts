import { Injectable } from '@angular/core';
import {
  ApiMember,
  ApiMemberSummary,
  CanonicalReference,
  MinimizedApiPackageReport,
  ParsedCanonicalReference,
} from '../models/api-report.models';
import { link, section, Section } from '../models/menu.models';
import { packageNames, packages } from '../reference/api-report.min.json';

const MODULE_REFERENCES: {
  [key: string]: () => Promise<{ default: ApiMemberSummary }>;
} = Object.fromEntries(
  Object.entries(import.meta.glob('../reference/**/*.json')).map(
    ([key, value]) => [
      key.replace('../reference/', '').replace(/\.json/, ''),
      value as () => Promise<{ default: ApiMemberSummary }>,
    ],
  ),
);

@Injectable({ providedIn: 'root' })
export class ReferenceService {
  getMinifiedApiReport(): MinimizedApiPackageReport {
    return { packageNames, packages } as unknown as MinimizedApiPackageReport;
  }

  getSection(): Section {
    return section(
      'API Reference',
      Object.entries(this.getMinifiedApiReport().packages).map(([pkg, api]) => {
        return section(
          pkg.replace(/^@hashbrownai\//, ''),
          Object.entries(api.symbols).map(([name]) => {
            return link(
              name,
              `/api/${pkg.replace(/^@hashbrownai/, '')}/${name}`,
            );
          }),
        );
      }),
    );
  }

  loadReferenceData(pkg: string, symbol: string): Promise<ApiMemberSummary> {
    /**
     * Wrapping this up in a Zone-aware promise for server-side rendering
     */
    return new Promise<ApiMemberSummary>((resolve, reject) => {
      const symbolParts = symbol.split('.');
      const namespacePath = symbolParts.slice(0, -1);
      const symbolName = symbolParts[symbolParts.length - 1];
      const path = `${pkg}/${namespacePath[0] ?? symbolName}`;

      if (!MODULE_REFERENCES[path]) {
        throw new Error(
          `Module not found: ${path}. Tried loading from ${path}.`,
        );
      }

      MODULE_REFERENCES[path]()
        .then((module) => {
          const summary = module.default;

          switch (namespacePath.length) {
            case 0: {
              resolve(summary);
              break;
            }
            case 1: {
              const [namespaceName] = namespacePath;
              const namespace = summary.members.find(
                (m) => m.name === namespaceName,
              );

              if (!namespace) {
                throw new Error(`Namespace not found: ${namespaceName}`);
              }

              if (namespace.kind !== 'Namespace') {
                throw new Error(`Namespace not found: ${namespaceName}`);
              }

              if (!namespace.members) {
                throw new Error(`Namespace has no members: ${namespaceName}`);
              }

              const members = namespace.members.filter(
                (m) => m.name === symbolName,
              );
              if (members.length === 0) {
                throw new Error(`Member not found: ${symbol}`);
              }
              const firstMember = members[0];

              resolve({
                ...firstMember,
                isDeprecated: Boolean(firstMember.docs.deprecated),
                members: members.map((m) => ({
                  ...m,
                  isDeprecated: Boolean(m.docs.deprecated),
                })),
              });
              break;
            }
            case 2: {
              const [outerNamespaceName, innerNamespaceName] = namespacePath;
              const outerNamespace = summary.members.find(
                (m) => m.name === outerNamespaceName,
              );

              if (!outerNamespace) {
                throw new Error(`Namespace not found: ${outerNamespaceName}`);
              }

              if (outerNamespace.kind !== 'Namespace') {
                throw new Error(`Namespace not found: ${outerNamespaceName}`);
              }

              if (!outerNamespace.members) {
                throw new Error(
                  `Namespace has no members: ${outerNamespaceName}`,
                );
              }

              const innerNamespace = outerNamespace.members.find(
                (m) => m.name === innerNamespaceName,
              );

              if (!innerNamespace) {
                throw new Error(
                  `Inner namespace not found: ${innerNamespaceName}`,
                );
              }

              if (innerNamespace.kind !== 'Namespace') {
                throw new Error(
                  `Inner namespace not found: ${innerNamespaceName}`,
                );
              }

              if (!innerNamespace.members) {
                throw new Error(
                  `Inner namespace has no members: ${innerNamespaceName}`,
                );
              }

              const members = innerNamespace.members.filter(
                (m) => m.name === symbolName,
              );
              if (members.length === 0) {
                throw new Error(`Member not found: ${symbol}`);
              }
              const firstMember = members[0];

              resolve({
                ...firstMember,
                isDeprecated: Boolean(firstMember.docs.deprecated),
                members: members.map((m) => ({
                  ...m,
                  isDeprecated: Boolean(m.docs.deprecated),
                })),
              });
              break;
            }
            default:
          }
        })
        .catch(reject);
    });
  }

  loadFromCanonicalReference(
    canonicalReference: CanonicalReference,
  ): Promise<ApiMemberSummary> {
    const parsed = new ParsedCanonicalReference(canonicalReference);
    const [hashbrownai, ...rest] = parsed.package.split('/');

    return this.loadReferenceData(rest.join('/'), parsed.name);
  }
}
