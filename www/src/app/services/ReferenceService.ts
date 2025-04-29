import { Injectable, signal } from '@angular/core';
import {
  ApiMemberSummary,
  CanonicalReference,
  MinimizedApiPackageReport,
  ParsedCanonicalReference,
} from '../models/api-report.models';
import { packageNames, packages } from '../reference/api-report.min.json';
import { link, section, Section } from '../models/menu.models';

const MODULE_REFERENCES = Object.fromEntries(
  Object.entries(import.meta.glob('../reference/**/*.json')).map(
    ([key, value]) => [
      key.replace('../reference/', '').replace(/\.json/, ''),
      value,
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
              `/ref/${pkg.replace(/^@hashbrownai/, '')}/${name}`,
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
      const path = `${pkg}/${symbol}`;

      if (!MODULE_REFERENCES[path]) {
        throw new Error(
          `Module not found: ${pkg}/${path}. Tried loading from ${path}.`,
        );
      }

      MODULE_REFERENCES[path]()
        .then((module) => {
          resolve((module as { default: ApiMemberSummary }).default);
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
