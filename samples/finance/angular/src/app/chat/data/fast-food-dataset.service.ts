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
    .get('fastfood.csv', { responseType: 'text' })
    .pipe(
      map((csv) => this.parseCsv(csv)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

  getAllItems() {
    return this.items$;
  }

  queryItems(options: FastFoodQueryOptions = {}) {
    return this.items$.pipe(
      map((items) => this.filterItems(items, options)),
    );
  }

  private filterItems(items: FastFoodItem[], options: FastFoodQueryOptions) {
    const normalized = {
      itemIds: options.itemIds?.filter(Boolean) ?? null,
      restaurants: options.restaurants?.filter(Boolean) ?? null,
      categories: options.categories?.filter(Boolean) ?? null,
      searchTerm: options.searchTerm?.trim().toLowerCase() ?? null,
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

    let filtered = items;

    if (normalized.itemIds?.length) {
      const ids = new Set(
        normalized.itemIds.map((value) => value.trim().toLowerCase()),
      );
      filtered = filtered.filter((item) => ids.has(item.id.toLowerCase()));
    }

    if (normalized.restaurants?.length) {
      const restaurants = new Set(
        normalized.restaurants.map((value) => value.toLowerCase()),
      );
      filtered = filtered.filter((item) =>
        restaurants.has(item.restaurant.toLowerCase()),
      );
    }

    if (normalized.categories?.length) {
      const categories = new Set(
        normalized.categories.map((value) => value.toLowerCase()),
      );
      filtered = filtered.filter((item) =>
        categories.has(item.menuCategory.toLowerCase()),
      );
    }

    if (normalized.searchTerm) {
      const tokens = normalized.searchTerm
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);

      if (tokens.length) {
        filtered = filtered.filter((item) => {
          const haystack = `${item.restaurant} ${item.item}`.toLowerCase();
          return tokens.every((token) => haystack.includes(token));
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
        this.compareByMetric(a, b, normalized.sortBy!, normalized.sortDirection),
      );
    }

    if (normalized.limit) {
      result = result.slice(0, normalized.limit);
    }

    return result;
  }

  private compareByMetric(
    a: FastFoodItem,
    b: FastFoodItem,
    metric: FastFoodSortMetric,
    direction: 'asc' | 'desc',
  ) {
    const diff = this.getMetricValue(a, metric) - this.getMetricValue(b, metric);
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
    const restaurant = record['restaurant']?.trim() || 'Unknown restaurant';
    const itemName = record['item']?.trim() || `Menu item ${index + 1}`;

    return {
      id: this.createId(restaurant, itemName, index),
      restaurant,
      item: itemName,
      calories: this.toNumber(record['calories']),
      caloriesFromFat: this.toNumber(record['cal_fat']),
      totalFat: this.toNumber(record['total_fat']),
      saturatedFat: this.toNumber(record['sat_fat']),
      transFat: this.toNumber(record['trans_fat']),
      cholesterol: this.toNumber(record['cholesterol']),
      sodium: this.toNumber(record['sodium']),
      totalCarbs: this.toNumber(record['total_carb']),
      fiber: this.toNumber(record['fiber']),
      sugar: this.toNumber(record['sugar']),
      protein: this.toNumber(record['protein']),
      vitaminA: this.toNumber(record['vit_a']),
      vitaminC: this.toNumber(record['vit_c']),
      calcium: this.toNumber(record['calcium']),
      menuCategory: record['salad']?.trim() || 'Other',
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
}
