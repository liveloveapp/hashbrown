import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, shareReplay } from 'rxjs';
import {
  FastFoodItem,
  FastFoodQueryOptions,
  FastFoodSortMetric,
} from '../models/fast-food-item';

@Injectable({ providedIn: 'root' })
export class FastFoodDatasetService {
  private readonly http = inject(HttpClient);
  private readonly items$ = this.http
    .get('fastfood_v2.csv', { responseType: 'text' })
    .pipe(
      map((csv) => this.parseCsv(csv)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

  getAllItems() {
    return this.items$;
  }

  queryItems(options: FastFoodQueryOptions = {}) {
    return this.items$.pipe(map((items) => this.filterItems(items, options)));
  }

  private filterItems(items: FastFoodItem[], options: FastFoodQueryOptions) {
    const normalized = {
      itemIds: this.normalizeList(options.itemIds),
      restaurants: this.normalizeList(options.restaurants),
      categories: this.normalizeList(options.categories),
      searchTerm: options.searchTerm?.trim() ?? null,
      maxCalories:
        typeof options.maxCalories === 'number' ? options.maxCalories : null,
      minCalories:
        typeof options.minCalories === 'number' ? options.minCalories : null,
      minProtein:
        typeof options.minProtein === 'number' ? options.minProtein : null,
      maxSodium:
        typeof options.maxSodium === 'number' ? options.maxSodium : null,
      limit:
        typeof options.limit === 'number' && options.limit > 0
          ? Math.floor(options.limit)
          : null,
      sortBy: options.sortBy ?? null,
      sortDirection: options.sortDirection ?? 'desc',
    } satisfies Required<Omit<FastFoodQueryOptions, 'sortDirection'>> & {
      sortDirection: 'asc' | 'desc';
    };

    this.log('Processing query', {
      ...normalized,
      totalItems: items.length,
    });

    let filtered = items;

    if (normalized.itemIds?.length) {
      const ids = new Set(
        normalized.itemIds.map((value) => value.trim().toLowerCase()),
      );
      filtered = filtered.filter((item) => ids.has(item.id.toLowerCase()));
    }

    if (normalized.restaurants?.length) {
      const unmatched = normalized.restaurants.filter(
        (restaurant) =>
          !items.some((item) => this.fuzzyMatch(restaurant, item.restaurant)),
      );

      if (unmatched.length) {
        this.log(
          'Some requested restaurants did not match directly',
          {
            unmatched,
            suggestions: this.suggestValues(
              unmatched,
              items,
              (item) => item.restaurant,
            ),
          },
          'info',
        );
      }

      filtered = filtered.filter((item) =>
        normalized.restaurants!.some((restaurant) =>
          this.fuzzyMatch(restaurant, item.restaurant),
        ),
      );

      if (!filtered.length) {
        this.log(
          'Restaurant filter removed all items',
          { requested: normalized.restaurants },
          'warn',
        );
      }
    }

    if (normalized.categories?.length) {
      filtered = filtered.filter((item) =>
        item.categories.some((itemCategory) =>
          normalized.categories!.some((category) =>
            this.fuzzyMatch(category, itemCategory, 0.65),
          ),
        ),
      );
    }

    if (normalized.searchTerm) {
      const tokens = normalized.searchTerm
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);

      if (tokens.length) {
        filtered = filtered.filter((item) => {
          const haystackWords =
            `${item.restaurant} ${item.item} ${item.shortName} ${item.description} ${item.servingSize} ${item.categories.join(' ')}`
              .split(/\s+/)
              .map((word) => word.trim())
              .filter(Boolean);
          return tokens.every((token) =>
            haystackWords.some(
              (word) =>
                this.fuzzyMatch(token, word, 0.65) ||
                this.normalizeForMatch(word).includes(
                  this.normalizeForMatch(token),
                ),
            ),
          );
        });
      }
    }

    if (normalized.maxCalories !== null) {
      filtered = filtered.filter(
        (item) => item.calories <= normalized.maxCalories!,
      );
    }

    if (normalized.minCalories !== null) {
      filtered = filtered.filter(
        (item) => item.calories >= normalized.minCalories!,
      );
    }

    if (normalized.minProtein !== null) {
      filtered = filtered.filter(
        (item) => item.protein >= normalized.minProtein!,
      );
    }

    if (normalized.maxSodium !== null) {
      filtered = filtered.filter(
        (item) => item.sodium <= normalized.maxSodium!,
      );
    }

    let result = [...filtered];

    if (normalized.sortBy) {
      result = result.sort((a, b) =>
        this.compareByMetric(
          a,
          b,
          normalized.sortBy!,
          normalized.sortDirection,
        ),
      );
    }

    if (normalized.limit) {
      result = result.slice(0, normalized.limit);
    }

    this.log('Query completed', {
      filters: normalized,
      filteredCount: filtered.length,
      returned: result.length,
    });

    return result;
  }

  private compareByMetric(
    a: FastFoodItem,
    b: FastFoodItem,
    metric: FastFoodSortMetric,
    direction: 'asc' | 'desc',
  ) {
    const diff =
      this.getMetricValue(a, metric) - this.getMetricValue(b, metric);
    if (diff !== 0) {
      return direction === 'asc' ? diff : -diff;
    }

    return a.item.localeCompare(b.item);
  }

  private getMetricValue(item: FastFoodItem, metric: FastFoodSortMetric) {
    switch (metric) {
      case 'protein':
        return item.protein;
      case 'totalFat':
        return item.totalFat;
      case 'sodium':
        return item.sodium;
      case 'sugar':
        return item.sugar;
      case 'calories':
      default:
        return item.calories;
    }
  }

  private parseCsv(csv: string): FastFoodItem[] {
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !!line);

    if (lines.length === 0) {
      return [];
    }

    const headers = this.splitCsvLine(lines[0]);

    return lines.slice(1).map((line, index) => {
      const cells = this.splitCsvLine(line, headers.length);
      const record: Record<string, string> = {};
      headers.forEach((header, headerIndex) => {
        record[header] = cells[headerIndex] ?? '';
      });

      return this.mapRecordToItem(record, index);
    });
  }

  private splitCsvLine(line: string, expectedLength?: number) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
          continue;
        }

        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    values.push(current.trim());

    if (expectedLength && values.length < expectedLength) {
      while (values.length < expectedLength) {
        values.push('');
      }
    }

    return values;
  }

  private mapRecordToItem(record: Record<string, string>, index: number) {
    const restaurant = record['chain']?.trim() || 'Unknown chain';
    const itemName =
      record['menu_item']?.trim() ||
      record['short_name']?.trim() ||
      `Menu item ${index + 1}`;
    const shortName = record['short_name']?.trim() || itemName;
    const description =
      record['description']?.trim() || 'No description provided.';
    const servingSize = record['serving_size']?.trim() || '1 serving';
    const categories = this.parseCategoryList(record['categories']);

    return {
      id: this.createId(restaurant, itemName, index),
      restaurant,
      item: itemName,
      shortName,
      description,
      servingSize,
      categories,
      calories: this.toNumber(record['calories']),
      totalFat: this.toNumber(record['total_fat_g']),
      saturatedFat: this.toNumber(record['saturated_fat_g']),
      transFat: this.toNumber(record['trans_fat_g']),
      cholesterol: this.toNumber(record['cholesterol_mg']),
      sodium: this.toNumber(record['sodium_mg']),
      totalCarbs: this.toNumber(record['carbs_g']),
      fiber: this.toNumber(record['fiber_g']),
      sugar: this.toNumber(record['sugar_g']),
      protein: this.toNumber(record['protein_g']),
      sources: this.parseSourceList(record['sources']),
      lastAudited: this.normalizeIsoDate(record['last_audited']),
    } satisfies FastFoodItem;
  }

  private createId(restaurant: string, item: string, index: number) {
    const slug = `${this.slugify(restaurant)}-${this.slugify(item)}`;
    return `${slug}-${index}`;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private toNumber(value?: string) {
    const parsed = Number(value ?? '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeList(
    values?: ReadonlyArray<string | null | undefined> | null,
  ) {
    return (
      values
        ?.map((value) => value?.trim())
        .filter((value): value is string => !!value) ?? null
    );
  }

  private parseCategoryList(raw?: string) {
    const values = this.splitPipeDelimited(raw);
    return values.length ? values : ['Other'];
  }

  private parseSourceList(raw?: string) {
    return this.splitPipeDelimited(raw).filter((value) =>
      /https?:\/\//i.test(value),
    );
  }

  private splitPipeDelimited(raw?: string) {
    return (
      raw
        ?.split('|')
        .map((value) => value.trim())
        .filter((value) => value.length > 0) ?? []
    );
  }

  private normalizeIsoDate(raw?: string) {
    const trimmed = raw?.trim();
    if (!trimmed) {
      return null;
    }

    const timestamp = Date.parse(trimmed);
    if (Number.isNaN(timestamp)) {
      return null;
    }

    return new Date(timestamp).toISOString();
  }

  private log(
    message: string,
    payload?: unknown,
    level: 'log' | 'info' | 'warn' = 'log',
  ) {
    const prefix = `[FastFoodDataset] ${message}`;
    if (level === 'warn') {
      console.warn(prefix, payload);
    } else if (level === 'info') {
      console.info(prefix, payload);
    } else {
      console.log(prefix, payload);
    }
  }

  private normalizeForMatch(value: string) {
    return value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private fuzzyMatch(query: string, candidate: string, threshold = 0.7) {
    const normalizedQuery = this.normalizeForMatch(query);
    const compactQuery = normalizedQuery.replace(/\s+/g, '');
    if (!normalizedQuery) {
      return false;
    }

    const variants = this.candidateVariants(candidate);
    const dynamicThreshold = normalizedQuery.length <= 4 ? 0.5 : threshold;

    for (const variant of variants) {
      if (!variant) {
        continue;
      }
      const compactVariant = variant.replace(/\s+/g, '');
      if (
        variant === normalizedQuery ||
        compactVariant === compactQuery ||
        (compactQuery.length >= 2 && compactVariant.startsWith(compactQuery))
      ) {
        return true;
      }
      const score = this.fuzzyScore(normalizedQuery, variant);
      if (score >= dynamicThreshold) {
        return true;
      }
    }

    return false;
  }

  private fuzzyScore(a: string, b: string) {
    const normalizedA = this.normalizeForMatch(a);
    const normalizedB = this.normalizeForMatch(b);
    if (!normalizedA || !normalizedB) {
      return 0;
    }
    if (normalizedA === normalizedB) {
      return 1;
    }
    if (
      normalizedA.includes(normalizedB) ||
      normalizedB.includes(normalizedA)
    ) {
      const shorter = Math.min(normalizedA.length, normalizedB.length);
      const longer = Math.max(normalizedA.length, normalizedB.length);
      return shorter / longer;
    }
    const distance = this.levenshteinDistance(normalizedA, normalizedB);
    return 1 - distance / Math.max(normalizedA.length, normalizedB.length);
  }

  private levenshteinDistance(a: string, b: string) {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + 1,
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  private suggestValues(
    queries: string[],
    items: FastFoodItem[],
    selector: (item: FastFoodItem) => string,
  ) {
    if (!queries.length) {
      return [];
    }

    const universe = Array.from(
      new Set(items.map((item) => selector(item)).filter(Boolean)),
    );

    return queries.map((query) => {
      let best: { value: string; score: number } | null = null;
      for (const candidate of universe) {
        const score = this.fuzzyScore(query, candidate);
        if (!best || score > best.score) {
          best = { value: candidate, score };
        }
      }
      return {
        query,
        suggestion: best?.value ?? null,
        score: best?.score ?? 0,
      };
    });
  }

  private candidateVariants(value: string) {
    const normalized = this.normalizeForMatch(value);
    const compact = normalized.replace(/\s+/g, '');
    const initials = normalized
      .split(' ')
      .map((word) => word[0] ?? '')
      .join('');
    return Array.from(new Set([normalized, compact, initials]));
  }
}
