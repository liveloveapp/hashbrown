import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../../lib/repo-root';
import { link, section, type Section } from './menu.models';

interface MinimizedApiReport {
  packageNames: string[];
  packages: Record<string, { symbols: Record<string, unknown> }>;
}

const reportFile = () =>
  join(repoRoot(), 'www/content/reference/api-report.min.json');

/**
 * Build the API menu from `api-report.min.json`: one section per package
 * (without the `@hashbrownai/` scope) listing every symbol as a link to
 * `/api/<pkg>/<symbol>`. Ports the Angular `ApiService.getSections`.
 */
export function apiMenuSections(): Section[] {
  const report = JSON.parse(
    readFileSync(reportFile(), 'utf-8'),
  ) as MinimizedApiReport;

  return Object.entries(report.packages).map(([pkg, api]) => {
    const name = pkg.replace(/^@hashbrownai\//, '');
    return section(
      name,
      Object.keys(api.symbols).map((symbol) =>
        link(symbol, `/api/${name}/${symbol}`),
      ),
    );
  });
}
